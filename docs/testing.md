# Testing

Tests are intentionally local. No GitHub Secrets, live cloud resources, workflow artifact smoke tests, or 400 MB benchmark are required by CI.

- `pnpm test`: manifest validation; logical-name selection across reruns and backend changes; explicit IDs; file discovery and ZIP roundtrip; traversal handling; upload fallback; failed manifest publication; mixed downloads; raw payloads; corruption detection.
- `pnpm test:storage`: starts the pinned official RustFS container with a disposable data layer and loopback-only port, then exercises real AWS SDK multipart upload/download/delete and lifecycle apply/check with unrelated-rule preservation. Stops the container afterward. Public local test credentials are not production secrets.
- `pnpm test:coverage`: V8 coverage report over core source, including unimported files. Coverage informs missing cases; no arbitrary percentage gate is imposed in this initial release.
- `pnpm check`: format, lint, strict types, Knip, tests, local RustFS, build, and committed-bundle consistency.

Local RustFS validates the shared protocol behavior. It does not establish provider-specific AWS/R2 compatibility, GitHub backend behavior, or throughput from Ubicloud. Those remain explicit release limitations rather than simulated claims.

Routine CI uses Node 24 on Linux, Windows, and macOS for unit tests and bundle reproducibility. RustFS integration, static checks, and workflow validation run once on Linux. Retry transport operations within the SDK; do not blanket-retry failed tests.

Direct handoff tests cover both backends and upload fallback, zero discovery calls, no external pointer download, invalid/conflicting input, expiry, storage scope, size, and digest failures.

Storage input tests exercise ambient configuration isolation, required credentials, secret masking, temporary credentials, and the actual SDK endpoint resolver without network calls. RustFS multipart tests use explicit client credentials.
