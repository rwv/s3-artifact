# Contributing

Use English for code, comments, logs, documentation, issues, pull requests, and release notes. Keep changes focused and describe user-visible behavior and validation.

## Local workflow

Use Node 24 and the pnpm version pinned in package.json. Docker is needed for local storage tests.

```sh
pnpm install --frozen-lockfile
pnpm fix
pnpm test
pnpm build
```

Commit updated `upload/dist` and `download/dist` with source changes. Then `pnpm check` must pass without modifying generated files. Generated bundles are excluded from formatting/linting, but their reproducibility is checked.

Use Oxlint, Oxfmt, TypeScript, Knip, and Vitest. Do not add competing lint, formatting, or test frameworks. Add tests for behavior changes and regressions, not assertions that merely mirror implementation.

## Pull requests

PR titles follow Conventional Commits, for example:

- `feat(upload): add a storage option`
- `fix(download): preserve explicit artifact selection`
- `docs: clarify retention behavior`

Types: feat, fix, perf, refactor, test, docs, build, ci, chore, style, revert. Scope is optional. Use `!` or a BREAKING CHANGE footer for incompatible changes. Intermediate branch commits need not follow this format; the squash commit must.

Only squash merging is enabled. Main requires PRs, successful quality/title gates, resolved conversations, and linear history. Single-maintainer development does not require an approval from a second person. Do not edit the squash title into a nonconforming message.

## Releases

The repository has one version for both actions. Internal workspace packages are private. Prepare a version/changelog PR, regenerate bundles, merge with passing gates, then dispatch the Release workflow from main. The workflow reruns the complete local gate on the exact commit before creating a release.

Exact version tags are never moved. The `v0` (later `v1`) convenience tag follows successful releases; pin an exact version or SHA for reproducibility. Initial 0.x releases are marked prereleases. Manifest schema changes require explicit compatibility planning independently of package versioning.
