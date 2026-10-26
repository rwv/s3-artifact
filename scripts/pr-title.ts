import { readFile } from "node:fs/promises";
import lint from "@commitlint/lint";
import config from "@commitlint/config-conventional";
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as {
  pull_request?: { title?: string };
};
const title = event.pull_request?.title;
if (!title) throw new Error("No pull request title was found.");
const result = await lint(title, config.rules);
for (const error of result.errors) console.error(error.message);
if (!result.valid) process.exitCode = 1;
