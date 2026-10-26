import { expect, it } from "vitest";
import load from "@commitlint/load";
import lint from "@commitlint/lint";
type ParserOptions = NonNullable<NonNullable<Parameters<typeof lint>[2]>["parserOpts"]>;

it("accepts conventional breaking headers and rejects non-conventional PR titles", async () => {
  const config = await load();
  const options = {
    ...(config.parserPreset ? { parserOpts: config.parserPreset.parserOpts as ParserOptions } : {}),
    defaultIgnores: config.defaultIgnores ?? true,
  };
  for (const title of [
    "fix: retry interrupted downloads",
    "feat!: change storage inputs",
    "feat(storage)!: change inputs",
  ])
    expect((await lint(title, config.rules, options)).valid, title).toBe(true);
  for (const title of ["update stuff", "feat:", "Merge branch main", "v1.0.0"])
    expect((await lint(title, config.rules, options)).valid, title).toBe(false);
});
