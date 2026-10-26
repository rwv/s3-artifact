# Contributing

Use English and keep changes focused on user-visible behavior.

## Local development

Use Node 24, the pinned pnpm version, and Docker for storage tests.

```sh
pnpm install --frozen-lockfile
pnpm fix
pnpm test
pnpm build
```

Commit regenerated `upload/dist` and `download/dist` with source changes, then run `pnpm check`. The gate uses Oxlint, Oxfmt, TypeScript, Knip, Vitest, and local RustFS. Add regression tests for changed behavior.

## Pull requests

Titles follow Conventional Commits: `fix: retry downloads`, `feat(upload): add an option`, or `feat(storage)!: change inputs`. We use the official commitlint conventional configuration in `commitlint.config.js`; CI validates PR titles. Check your latest commit locally with:

```sh
pnpm commitlint --last
```

Only squash merging is enabled. Main requires passing quality/title gates and resolved review conversations. The PR title becomes the squash commit subject.

## Releases

Both actions share one version. Update package.json and CHANGELOG.md, regenerate bundles, merge with passing gates, then dispatch the Release workflow from main.

Exact version tags stay fixed. The `v1` alias follows compatible 1.x releases; pin an exact version or SHA for reproducibility. Inputs, outputs, and manifest v1 are stable in 1.x; incompatible changes require a new major version. Version manifest schemas separately when their format changes.
