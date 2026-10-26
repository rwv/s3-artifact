# Changelog

## 0.3.0

- Configure all action storage settings through `with`, including new `s3-access-key-id`, `s3-secret-access-key`, and optional `s3-session-token` inputs.
- Pass masked credentials directly to each action's SDK client and ignore ambient endpoint overrides.
- Breaking: remove action environment configuration and default credential-chain fallback. Migrate AWS/S3 environment settings to explicit inputs; standalone lifecycle CLI behavior is unchanged.
- Verify environment isolation and SDK endpoint resolution without cloud calls.

## 0.2.0

- Patch the transitive glob CLI dependency to 10.5.0 (GHSA-5j98-mcp5-4vw2).
- Add compact upload `manifest` output and optional download `manifest` input for direct job-to-job handoff.
- Skip discovery for both backends and native pointer download for S3/R2 while preserving integrity and expiry checks.
- Emit native descriptors for explicit GitHub storage and upload fallback; continue publishing external pointer artifacts.
- Validate the feature with local unit tests and Linux, Windows, and macOS quality gates.

## 0.1.0

Initial prerelease.

- S3/R2 payload upload with GitHub-native manifest discovery.
- Explicit `storage: github` bypass and `auto`/`s3` selection.
- Linux, Windows, and macOS unit/build validation.
- Native fallback when storage is unconfigured or external upload fails.
- Logical-name selection, exact GitHub artifact IDs, patterns, mixed backends, raw files, and ZIP extraction.
- SHA-256 verification, finite retention, and a prefix-based lifecycle setup/check CLI.
- English documentation, MIT license, and local-only quality gates using Oxlint, Oxfmt, TypeScript, Knip, Vitest, and RustFS.

Validation is local: no live AWS/R2, GitHub artifact smoke tests, or Ubicloud throughput measurements are claimed.
