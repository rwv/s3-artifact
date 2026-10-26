import { build } from "esbuild";
await Promise.all(
  ["upload", "download"].map((name) =>
    build({
      entryPoints: [`${name}/src/index.ts`],
      outfile: `${name}/dist/index.js`,
      bundle: true,
      platform: "node",
      target: "node24",
      format: "esm",
      banner: {
        js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
      },
      sourcemap: false,
      minify: false,
      legalComments: "linked",
    }),
  ),
);
await import("./notices.mjs");
