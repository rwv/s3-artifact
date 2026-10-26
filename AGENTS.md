# Repository instructions

- Use English for all repository content.
- Use TypeScript, pnpm, Oxlint, Oxfmt, Knip, and Vitest.
- Keep the architecture small: two Actions, shared core, one lifecycle CLI.
- Preserve the documented GitHub-compatible inputs and logical naming contract.
- Do not add live-service secrets, cloud smoke tests, mandatory benchmarks, or external services to CI. Use unit tests and disposable local RustFS.
- Test changed behavior; do not inflate test matrices or add defensive layers without a concrete failure case.
- Run relevant tests and pnpm check before finalizing. Commit regenerated Action bundles with source changes.
- Use Conventional PR titles and squash-only merging. Do not force-push main or rewrite released exact tags.
- Never embed credentials in artifacts, logs, fixtures beyond documented local-only test credentials, or published files.
- Review docs/compatibility.md and docs/testing.md when changing semantics.
