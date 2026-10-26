# s3-artifact

[![CI](https://github.com/rwv/s3-artifact/actions/workflows/ci.yml/badge.svg)](https://github.com/rwv/s3-artifact/actions/workflows/ci.yml)

GitHub Actions artifact upload and download, with large payloads stored in **Amazon S3 or Cloudflare R2**. GitHub keeps a small manifest artifact for discovery. If external storage is not configured or its upload fails, the upload action can fall back to ordinary GitHub artifacts.

Designed for transferring build outputs between jobs, especially on self-hosted runners. An independent MIT-licensed project, not an official GitHub, AWS, or Cloudflare product.

> **Early release:** the workflow inputs follow `actions/upload-artifact` v7 and `actions/download-artifact` v8, with documented differences. Automated validation uses unit tests and local RustFS, not live AWS/R2 or GitHub artifact smoke tests. No production throughput claim is made.

## Quick start

Configure your bucket's lifecycle **once** using the [setup instructions](docs/lifecycle.md). Keep the bucket private.

Provide these repository configuration variables:

- `S3_ARTIFACT_BUCKET`: bucket name.
- `S3_ARTIFACT_ENDPOINT`: R2/S3-compatible endpoint; leave unset for AWS S3.
- `AWS_REGION`: `auto` for R2, or the actual AWS region for S3.

Provide storage credentials to both jobs through the standard AWS environment. For AWS, an earlier OIDC authentication step can populate these instead of long-lived secrets. For R2, configure the bucket credentials in GitHub Actions Secrets.

```yaml
name: Build
on: push
permissions:
  contents: read

env:
  S3_ARTIFACT_BUCKET: ${{ vars.S3_ARTIFACT_BUCKET }}
  S3_ARTIFACT_ENDPOINT: ${{ vars.S3_ARTIFACT_ENDPOINT }}
  AWS_REGION: ${{ vars.AWS_REGION }}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: |
          mkdir -p dist
          echo hello > dist/message.txt
      - uses: rwv/s3-artifact/upload@v0.2.0
        with:
          name: build
          path: dist/
          retention-days: 30
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

  consume:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: rwv/s3-artifact/download@v0.2.0
        with:
          name: build
          path: dist/
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      - run: cat dist/message.txt
```

You can also set storage inputs directly on either action:

```yaml
with:
  s3-bucket: my-artifacts
  s3-endpoint: https://ACCOUNT_ID.r2.cloudflarestorage.com
  s3-region: auto
```

For a jurisdiction-specific R2 bucket, use its corresponding endpoint. For AWS S3, omit `s3-endpoint` and use the bucket's region. Credentials are resolved by the AWS SDK's standard provider chain; credentials are never embedded in manifests.

## How it works

For logical name `build`, the upload action stores:

- **GitHub artifact:** `build.s3-artifact` containing `build.s3-artifact.manifest.json`.
- **External object:** an immutable payload under `s3-artifacts/v1/ttl-030/<server>/<repository-id>/<run-id>/<attempt>/<uuid>/payload`.

The payload is uploaded first. Publishing the GitHub manifest is the commit point. The download action queries GitHub, translates physical names to logical names, then retrieves the payload. No database, Worker, proxy, or periodic cleanup service is required.

The GitHub UI and official download action download the **manifest**, not the external payload. Use this project's download action to restore the original files. GitHub displays the manifest's size.

## Upload inputs

| Input                  | Default    | Behavior                                                                                    |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `name`                 | `artifact` | Logical name; `.s3-artifact` is a reserved suffix.                                          |
| `path`                 | Required   | File, directory, or multiline glob patterns; `!` exclusions supported.                      |
| `if-no-files-found`    | `warn`     | `warn`, `error`, or `ignore`.                                                               |
| `retention-days`       | `0`        | `0` means 30 days. Supports 1–90, capped by repository retention.                           |
| `compression-level`    | `6`        | ZIP compression from 0–9. Use 0 for already-compressed payloads.                            |
| `overwrite`            | `false`    | Delete matching logical artifacts before uploading.                                         |
| `include-hidden-files` | `false`    | Include hidden files when enabled.                                                          |
| `archive`              | `true`     | If false, requires a single file and uses its basename as the logical name.                 |
| `storage`              | `auto`     | `auto`: use a configured bucket; `github`: bypass external storage; `s3`: require a bucket. |
| `fallback`             | `true`     | Use native GitHub storage if no bucket is configured or external upload fails.              |

## Download inputs

| Input             | Default            | Behavior                                                             |
| ----------------- | ------------------ | -------------------------------------------------------------------- |
| `name`            | Unset              | Select one logical artifact.                                         |
| `artifact-ids`    | Unset              | Comma-separated GitHub IDs; mutually exclusive with `name`.          |
| `path`            | Workspace          | Destination; supports `~/`.                                          |
| `pattern`         | Unset              | Glob against logical names; ignored with name or IDs.                |
| `merge-multiple`  | `false`            | Merge into one directory; otherwise create logical-name directories. |
| `github-token`    | Unset              | Enables public API discovery for another run/repository.             |
| `repository`      | Current repository | Used with `github-token`.                                            |
| `run-id`          | Current run        | Used with `github-token`.                                            |
| `skip-decompress` | `false`            | Keep the real payload ZIP/raw file, not the manifest.                |
| `digest-mismatch` | `error`            | `error`, `warn`, `info`, or `ignore`.                                |

## Shared storage inputs

| Input                 | Environment fallback / default                    |
| --------------------- | ------------------------------------------------- |
| `s3-bucket`           | `S3_ARTIFACT_BUCKET`; unset selects native upload |
| `s3-endpoint`         | `S3_ARTIFACT_ENDPOINT`; unset uses AWS            |
| `s3-region`           | `AWS_REGION`, then `auto`                         |
| `s3-prefix`           | `S3_ARTIFACT_PREFIX`, then `s3-artifacts`         |
| `s3-force-path-style` | `false`; useful for local S3 services             |

Inputs take precedence over environment variables. Configure the same bucket, prefix, and endpoint on upload and download. Reading an external manifest without external storage configuration is an error; it cannot restore a payload that was never backed up to GitHub.

To bypass external storage for one upload even when bucket variables are set:

```yaml
- uses: rwv/s3-artifact/upload@v0.2.0
  with:
    name: build
    path: dist/
    storage: github
```

`storage: github` does not read external configuration or contact S3/R2. `storage: s3` requires a bucket; `fallback` still controls recovery from transfer failures. Use `storage: s3` with `fallback: false` to require an external upload to succeed. Download chooses the backend from the selected artifact automatically.

## Outputs

Upload exposes:

- `artifact-id`: actual GitHub ID (the manifest artifact in external mode).
- `artifact-url`: actual GitHub URL (downloads the manifest in external mode).
- `artifact-digest`: SHA-256 of the GitHub artifact.
- `payload-digest`: SHA-256 of the actual payload.
- `storage-backend`: `s3` or `github`.

Download exposes `download-path`, the absolute destination directory.

## Compatibility and fallback

Both external and ordinary GitHub artifacts can be downloaded in the same step. Name/pattern matching and output directories use logical names. Across visible reruns, name queries choose the greatest GitHub artifact ID for each logical name. Explicit IDs retain exact selection, including older artifacts. Attempts are recorded in object keys but do not restrict discovery to the current attempt.

- No bucket configured: native upload (unless `fallback: false`).
- External upload fails after bounded SDK retries: native upload, with a warning.
- Invalid inputs or duplicate logical names: fail, rather than fallback.
- GitHub manifest publication fails: fail; do not switch backends after a potentially committed pointer.
- External download fails: fail. There is **no dual-write backup**.

See [compatibility details](docs/compatibility.md) for naming, overwrite, permissions, and retention differences.

## Development

Node 24, pnpm 10.28.2, and Docker are required for the complete local gate.

```sh
pnpm install --frozen-lockfile
pnpm test          # Unit and filesystem tests; no external services
pnpm test:storage  # Disposable, pinned RustFS container on loopback
pnpm build
pnpm check        # Full gate; dist must match committed files
```

The two action directories include committed bundles. Consumers do not install Node packages or pnpm. See [CONTRIBUTING.md](CONTRIBUTING.md) and [testing documentation](docs/testing.md).

## License

[MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.txt) for production dependency license texts. Bundles also retain linked license comments.

## Direct manifest handoff

Pass the compact `manifest` output between jobs to avoid GitHub artifact discovery and, for S3/R2, downloading the manifest artifact. Upload still publishes the native manifest artifact for UI access and later discovery.

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      manifest: ${{ steps.upload.outputs.manifest }}
    steps:
      # Prepare your build and configure storage as in the examples above.
      - uses: rwv/s3-artifact/upload@v0.2.0
        id: upload
        with:
          name: build
          path: dist/

  consume:
    needs: build
    runs-on: ubuntu-latest
    steps:
      # Configure the same storage on this job when using S3/R2.
      - uses: rwv/s3-artifact/download@v0.2.0
        with:
          manifest: ${{ needs.build.outputs.manifest }}
          path: dist/
```

Native storage and upload fallback emit a descriptor containing the native artifact ID and available digest. Download uses that ID directly. A nonempty `manifest` is mutually exclusive with `name`, `artifact-ids`, and `pattern`; it represents one artifact extracted directly into `path`. Empty input retains the usual discovery flow. Invalid nonempty input fails without discovery fallback.

The descriptor contains no credentials or endpoint. External downloads still validate expiry, bucket/prefix, size, and SHA-256. Treat the descriptor as trusted workflow data: checksums detect corruption, not malicious modification of both payload and descriptor. Cross-run native downloads still require the appropriate `github-token`, `repository`, and `run-id` inputs.

Native direct handoff skips this action's discovery call, but the official artifact SDK may still query metadata internally when downloading by ID. External direct handoff makes no GitHub artifact API calls during download.
