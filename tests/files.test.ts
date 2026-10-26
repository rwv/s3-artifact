import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  discover,
  zipFiles,
  extractZip,
  safeDestination,
  digestFile,
} from "../packages/core/src/files.ts";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function fixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "s3-artifact-test-"));
  directories.push(dir);
  return dir;
}
it("roundtrips nested files and excludes hidden files by default", async () => {
  const dir = await fixture();
  const source = path.join(dir, "source");
  await mkdir(path.join(source, "nested"), { recursive: true });
  await writeFile(path.join(source, "nested", "hello.txt"), "hello");
  await writeFile(path.join(source, ".hidden"), "secret");
  const found = await discover(`${source}/`, false);
  expect(found.files).toHaveLength(1);
  const zip = path.join(dir, "payload.zip");
  await zipFiles(found.files, found.root, zip, 0);
  const target = path.join(dir, "restored");
  await extractZip(zip, target);
  expect(await readFile(path.join(target, "nested", "hello.txt"), "utf8")).toBe("hello");
  expect(await digestFile(zip)).toMatch(/^[a-f0-9]{64}$/u);
  expect((await discover(`${source}/`, true)).files).toHaveLength(2);
});
it("preserves the single-file basename and honors exclusions", async () => {
  const dir = await fixture();
  await writeFile(path.join(dir, "hello.txt"), "hello");
  await writeFile(path.join(dir, "skip.txt"), "skip");
  const one = await discover(path.join(dir, "hello.txt"), false);
  expect(one.root).toBe(dir);
  const excluded = await discover(`${dir}/*.txt\n!${dir}/skip.txt`, false);
  expect(excluded.files).toEqual([path.join(dir, "hello.txt")]);
});
it("rejects traversal and writing through an existing symlink", async () => {
  const dir = await fixture();
  await expect(safeDestination(dir, "../escape")).rejects.toThrow("Unsafe");
  await expect(safeDestination(dir, "C:\\escape")).rejects.toThrow("Unsafe");
  await symlink(
    tmpdir(),
    path.join(dir, "link"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(safeDestination(dir, "link/escape")).rejects.toThrow("symbolic link");
});
