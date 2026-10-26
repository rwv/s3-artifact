# Changelog

## 0.1.0

Initial prerelease.

- S3/R2 payload upload with GitHub-native manifest discovery.
- Native fallback when storage is unconfigured or external upload fails.
- Logical-name selection, exact GitHub artifact IDs, patterns, mixed backends, raw files, and ZIP extraction.
- SHA-256 verification, finite retention, and a prefix-based lifecycle setup/check CLI.
- English documentation, MIT license, and local-only quality gates using Oxlint, Oxfmt, TypeScript, Knip, Vitest, and RustFS.

Validation is local: no live AWS/R2, GitHub artifact smoke tests, or Ubicloud throughput measurements are claimed.
