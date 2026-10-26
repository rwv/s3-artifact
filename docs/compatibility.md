# Compatibility

The input reference is upload-artifact v7 and download-artifact v8. The actions require a Node 24-capable runner and support Linux, Windows, and macOS. GHES is not supported.

## Naming and reruns

Logical `build` maps to native `build` or external `build.s3-artifact`. The suffix is reserved. Names must be safe filenames and fit within 255 UTF-8 bytes including `.s3-artifact.manifest.json`.

Name and pattern queries select the highest visible artifact ID per logical name. Explicit IDs select exact artifacts, including earlier attempts. A previous attempt's visible name requires `overwrite: true` before uploading again. Parallel producers need unique names.

Overwrite deletes the latest visible artifacts for both physical names before uploading. If replacement fails, the previous artifact may already be gone. Old S3 payloads expire through lifecycle.

## Files

ZIP entries are regular files; upload dereferences symlinks and does not preserve executable bits or empty directories. Use a tar file when those matter. Multiple upload paths use their common search root. Hidden files are excluded by default.

Single-name, single-ID, and direct-manifest downloads extract directly into `path`. Multiple artifacts use logical-name subdirectories unless `merge-multiple` is set. Collisions resolve in ascending artifact-ID order, so the highest ID wins.

`archive: false` requires one file and uses its basename as the artifact name. `skip-decompress` keeps the actual payload rather than the metadata.

## Retention and access

Default retention is 30 days. `0` selects that default; 1–90 are supported, capped by `GITHUB_RETENTION_DAYS`. External logical expiry is enforced by download. Physical lifecycle expiration uses N+1 days and runs asynchronously. Deleting the GitHub artifact does not immediately delete its S3 payload.

Object paths separate runs but do not create an authorization boundary for shared bucket credentials. Configure bucket access independently. Cross-repository GitHub access does not grant bucket access.

## Manifest handoff and integrity

External manifests use schema version 1 with kind `s3-artifact`; native descriptors use `github-artifact` with an artifact ID and optional digest. Both are compact JSON outputs. Upload still publishes external pointer artifacts when direct handoff is used.

Pass trusted upload outputs. Descriptors are unsigned and contain no credentials or endpoint. External downloads validate the configured bucket/prefix, expiry, size, and SHA-256. `digest-mismatch` controls hash failures; size and expiry failures always stop download.

Direct external downloads make no GitHub artifact API calls. Native downloads delegate to the official SDK, which may query metadata internally. Empty input uses discovery, including when GitHub suppresses a job output because of secret filtering.

## Configuration migration

Since v0.3, storage settings and credentials use `with` inputs. The actions neither use the default AWS credential chain nor export `AWS_*` variables. Temporary credentials can come from an authentication step's outputs. The standalone lifecycle CLI keeps its own CLI/environment interface.

Credentials are passed directly to the SDK client and masked in logs. Storage uses HTTPS and provider encryption; there is no client-side encryption.
