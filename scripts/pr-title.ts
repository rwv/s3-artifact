import { readFile } from "node:fs/promises";
import lint from "@commitlint/lint";
type ParserOptions = NonNullable<NonNullable<Parameters<typeof lint>[2]>["parserOpts"]>;
import load from "@commitlint/load";
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as {
  pull_request?: { title?: string };
};
const title = event.pull_request?.title;
if (!title) throw new Error("No pull request title was found.");
const config = await load();
const result = await lint(title, config.rules, {
  ...(config.parserPreset ? { parserOpts: config.parserPreset.parserOpts as ParserOptions } : {}),
  defaultIgnores: config.defaultIgnores ?? true,
});
for (const error of result.errors) console.error(error.message);
if (!result.valid) process.exitCode = 1;
