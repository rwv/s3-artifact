import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/u.test(version))
  throw new Error("Release version must be a stable SemVer triplet.");
if (process.env.GITHUB_REF !== "refs/heads/main") throw new Error("Release must run from main.");
const repo = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
if (!repo || !sha) throw new Error("Missing GitHub workflow context.");
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();
const tag = `v${version}`;
const matching = JSON.parse(gh(["api", `repos/${repo}/git/matching-refs/tags/${tag}`]));
if (matching.some((ref) => ref.ref === `refs/tags/${tag}`))
  throw new Error(`${tag} already exists; exact version tags are immutable.`);
const changelog = await readFile("CHANGELOG.md", "utf8");
const heading = `## ${version}\n`;
const start = changelog.indexOf(heading);
if (start < 0) throw new Error("Missing changelog entry.");
const notes = changelog
  .slice(start + heading.length)
  .split("\n## ")[0]
  .trim();
const temp = await mkdtemp(path.join(tmpdir(), "s3-artifact-release-"));
try {
  const file = path.join(temp, "notes.md");
  await writeFile(file, notes);
  const args = [
    "release",
    "create",
    tag,
    "--repo",
    repo,
    "--target",
    sha,
    "--title",
    tag,
    "--notes-file",
    file,
  ];
  if (version.startsWith("0.")) args.push("--prerelease");
  console.log(gh(args));
  const major = `v${version.split(".")[0]}`;
  const refs = JSON.parse(gh(["api", `repos/${repo}/git/matching-refs/tags/${major}`]));
  if (refs.some((ref) => ref.ref === `refs/tags/${major}`))
    gh([
      "api",
      `repos/${repo}/git/refs/tags/${major}`,
      "--method",
      "PATCH",
      "-f",
      `sha=${sha}`,
      "-F",
      "force=true",
    ]);
  else
    gh([
      "api",
      `repos/${repo}/git/refs`,
      "--method",
      "POST",
      "-f",
      `ref=refs/tags/${major}`,
      "-f",
      `sha=${sha}`,
    ]);
  console.log(`Updated ${major} to ${sha}.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
