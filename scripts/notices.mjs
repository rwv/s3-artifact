import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const licenses = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  }),
);
const packages = Object.values(licenses)
  .flat()
  .sort((a, b) => a.name.localeCompare(b.name, "en"));
const sections = [
  "THIRD-PARTY NOTICES\n\nProduction dependency license texts. Some dependencies may be excluded from the final bundles by tree shaking.",
];
for (const pkg of packages) {
  const texts = new Set();
  for (const directory of pkg.paths) {
    const files = await readdir(directory, { withFileTypes: true });
    for (const file of files
      .filter((file) => file.isFile() && /^(licen[sc]e|notice|copying)(\.|$)/iu.test(file.name))
      .sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      texts.add(
        (await readFile(path.join(directory, file.name), "utf8")).replaceAll("\r\n", "\n").trim(),
      );
    }
  }
  sections.push(
    `${pkg.name} (${pkg.versions.join(", ")})\nLicense: ${pkg.license}\n${pkg.homepage ?? ""}\n\n${[...texts].join("\n\n")}`,
  );
}
await writeFile(
  "THIRD_PARTY_NOTICES.txt",
  `${sections.join("\n\n------------------------------------------------------------\n\n")}\n`,
);
