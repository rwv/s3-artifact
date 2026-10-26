# Testing

- `pnpm test`: unit tests for selection, manifests, ZIP handling, fallback, integrity, configuration isolation, interrupted downloads, and Conventional Commit titles.
- `pnpm test:storage`: disposable local RustFS container; exercises SDK multipart upload/download/delete and lifecycle configuration. Requires Docker.
- `pnpm test:coverage`: V8 coverage report for core source.
- `pnpm check`: formatting, lint, types, Knip, tests, RustFS, build, and committed-bundle consistency.

CI runs unit tests and bundle checks on Linux, Windows, and macOS. Static checks and RustFS run on Linux. Tests use no cloud resources or production secrets.

Local RustFS validates the shared S3 protocol. Real AWS/R2 behavior and Ubicloud throughput have not been measured.
