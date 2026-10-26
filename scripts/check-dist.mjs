import { execFileSync } from "node:child_process";
const diff = execFileSync(
  "git",
  [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    "upload/dist",
    "download/dist",
    "THIRD_PARTY_NOTICES.txt",
  ],
  { encoding: "utf8" },
);
if (diff.trim()) {
  console.error(diff.trim());
  console.error(
    execFileSync(
      "git",
      ["diff", "--stat", "--", "upload/dist", "download/dist", "THIRD_PARTY_NOTICES.txt"],
      { encoding: "utf8" },
    ),
  );
  console.error(
    execFileSync(
      "git",
      [
        "diff",
        "--no-ext-diff",
        "--unified=1",
        "--",
        "upload/dist",
        "download/dist",
        "THIRD_PARTY_NOTICES.txt",
      ],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    ).slice(0, 12000),
  );
  console.error(
    "Generated action bundles differ from the committed files. Run pnpm build and commit dist.",
  );
  process.exitCode = 1;
}
