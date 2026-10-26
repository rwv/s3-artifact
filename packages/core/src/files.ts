import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { ZipArchive } from "archiver";
import { Open } from "unzipper";
import * as glob from "@actions/glob";

export async function discover(
  pattern: string,
  hidden: boolean,
): Promise<{ files: string[]; root: string }> {
  const globber = await glob.create(pattern, {
    followSymbolicLinks: true,
    excludeHiddenFiles: !hidden,
    omitBrokenSymbolicLinks: true,
  });
  const files: string[] = [];
  for await (const file of globber.globGenerator())
    if ((await stat(file)).isFile()) files.push(file);
  const roots = globber.getSearchPaths();
  let root = roots[0] ?? process.cwd();
  for (const entry of roots.slice(1)) {
    while (
      path.relative(root, entry).startsWith(`..${path.sep}`) ||
      path.relative(root, entry) === ".." ||
      path.isAbsolute(path.relative(root, entry))
    ) {
      const parent = path.dirname(root);
      if (parent === root) throw new Error("Artifact paths must share a filesystem root.");
      root = parent;
    }
  }
  if (files.length === 1 && files[0] === root) root = path.dirname(root);
  return { files, root };
}
export async function digestFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
export async function zipFiles(
  files: string[],
  root: string,
  output: string,
  level: number,
): Promise<void> {
  const archive = new ZipArchive({ zlib: { level } });
  const writing = pipeline(archive, createWriteStream(output));
  archive.on("warning", (error) => archive.destroy(error));
  for (const file of files)
    archive.file(await realpath(file), {
      name: path.relative(root, file).split(path.sep).join("/"),
      mode: 0o644,
    });
  await Promise.all([writing, archive.finalize()]);
}
export async function safeDestination(root: string, entry: string): Promise<string> {
  const normalized = entry.replaceAll("\\", "/");
  const target = path.resolve(root, normalized);
  const relative = path.relative(path.resolve(root), target);
  if (
    /^[a-z]:/iu.test(normalized) ||
    path.posix.isAbsolute(normalized) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error(`Unsafe archive path: ${entry}`);
  let cursor = path.resolve(root);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error(`Refusing to write through a symbolic link: ${cursor}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return target;
}
export async function extractZip(file: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const zip = await Open.file(file);
  for (const entry of zip.files) {
    const output = await safeDestination(destination, entry.path);
    if (entry.type === "Directory") await mkdir(output, { recursive: true });
    else {
      await mkdir(path.dirname(output), { recursive: true });
      await pipeline(entry.stream(), createWriteStream(output, { mode: 0o644 }));
    }
  }
}
