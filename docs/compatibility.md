# Compatibility contract

The reference interfaces are upload-artifact v7 and download-artifact v8. This project offers workflow-level compatibility, not an interchangeable GitHub storage format.

## Names and discovery

Logical `build` maps to native `build` or external-pointer `build.s3-artifact`. The suffix is reserved. Names cannot contain filesystem path separators, GitHub-invalid filename characters, or exceed 255 UTF-8 bytes including the full `.s3-artifact.manifest.json` filename suffix. Pattern matching occurs after removing the suffix.

GitHub's artifact client determines the visible run scope. We do not query unrelated runs or require matching the current attempt. Reruns keep the run ID and get distinct payload UUIDs. Explicit artifact IDs select exact artifacts; name/all queries deduplicate to the highest artifact ID. Re-run behavior is covered at the selection layer, not by live GitHub smoke tests.

Use a unique logical name per parallel producer (for example, include a matrix dimension). Concurrent uploads of the same logical name are unsupported, particularly when one producer falls back to GitHub and another publishes an external pointer. Prefixes organize storage; shared bucket credentials do not enforce per-run authorization.

## Overwrite

The wrapper checks visible logical names before either backend is used. If a previous attempt remains visible under the same logical name, uploading again requires `overwrite: true`. This is a deliberate v0.1.0 difference from backend-specific rerun name handling; downloading a previous attempt does not require an override.

`overwrite: true` deletes the latest visible artifacts for both physical names before uploading. A failed replacement may leave no current artifact, like the official delete-then-upload behavior. Older rerun artifacts can still exist and be selected by ID. Old external payloads expire through lifecycle; overwrite does not eagerly scan or delete storage objects.

## Files and downloads

ZIP is the default. `compression-level: 0` still produces a ZIP. `archive: false` uses a single file's basename, ignoring `name`. External ZIP entries contain regular files; symlinks are dereferenced during upload. Executable bits are not preserved. Package a tar file yourself when permissions or symlinks matter.

Multiple paths use their common search root. Hidden files are excluded by default. Empty directories are not retained. Absolute source paths are not stored in manifests.

Single-name/single-ID downloads extract directly to `path`. Multiple matches use logical-name directories unless `merge-multiple` is enabled. For collisions, downloads execute in ascending artifact-ID order: the highest ID wins deterministically. This may differ from the official action's parallel completion order.

External ZIP extraction rejects traversal and existing symlink targets. The native branch delegates download/extraction to `@actions/artifact`.

## Retention

Default retention is 30 days, not the repository default. `0` selects that default. Supported values are 1–90, capped by `GITHUB_RETENTION_DAYS`. No unlimited retention is supported.

External logical expiry is enforced by this action. Objects get one extra day of physical retention to accommodate manifest publication after object creation. Lifecycle deletion is asynchronous. Direct bucket access bypasses the action's logical expiry. GitHub deletion does not trigger immediate external deletion.

## Metadata and integrity

GitHub UI, artifact APIs, and official download tools see the manifest archive. Its ID, URL, size, and digest refer to that archive. `payload-digest` refers to the actual external payload. `digest-mismatch` controls both manifest and payload SHA-256 comparisons; invalid manifests, expired artifacts, and size mismatches fail independently.

Manifests have a `kind` marker and `schemaVersion`. Credentials and endpoints are not read from manifests. The download environment must configure the matching bucket/prefix and endpoint. Cross-repository GitHub permission alone does not grant bucket access.

## Supported environment

The actions run on Node 24-capable GitHub Actions runners. Initial automated validation targets Linux. Windows/macOS and GitHub Enterprise Server are not claimed as validated platforms in v0.1.0. Storage transport uses the shared S3 API subset, without AWS object tagging, ACLs, KMS parameters, or bucket-policy management.

There is no client-side encryption. Use HTTPS, private buckets, provider-native encryption, and appropriately scoped credentials. AWS static and temporary credentials are supported through the SDK provider chain, including session tokens supplied by an earlier OIDC step.
