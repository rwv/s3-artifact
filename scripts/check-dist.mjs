import { execFileSync } from "node:child_process";
const diff = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all", "--", "upload/dist", "download/dist"],
  { encoding: "utf8" },
);
if (diff.trim()) {
  console.error(
    "Generated action bundles differ from the committed files. Run pnpm build and commit dist.",
  );
  process.exitCode = 1;
}
