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
- `S3_ARTIFACT_REGION`: `auto` for R2, or the actual AWS region for S3.

Configure bucket credentials in GitHub Actions Secrets. Pass all storage settings through each action's `with` inputs; the action passes credentials directly to its own SDK client and masks them in logs. It does not export or inherit global AWS credentials.

```yaml
name: Build
on: push
permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: |
          mkdir -p dist
          echo hello > dist/message.txt
      - uses: rwv/s3-artifact/upload@v0.3.0
        with:
          name: build
          path: dist/
          retention-days: 30
          s3-bucket: ${{ vars.S3_ARTIFACT_BUCKET }}
          s3-endpoint: ${{ vars.S3_ARTIFACT_ENDPOINT }}
          s3-region: ${{ vars.S3_ARTIFACT_REGION }}
          s3-access-key-id: ${{ secrets.S3_ARTIFACT_ACCESS_KEY_ID }}
          s3-secret-access-key: ${{ secrets.S3_ARTIFACT_SECRET_ACCESS_KEY }}

  consume:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: rwv/s3-artifact/download@v0.3.0
        with:
          name: build
          path: dist/
          s3-bucket: ${{ vars.S3_ARTIFACT_BUCKET }}
          s3-endpoint: ${{ vars.S3_ARTIFACT_ENDPOINT }}
          s3-region: ${{ vars.S3_ARTIFACT_REGION }}
          s3-access-key-id: ${{ secrets.S3_ARTIFACT_ACCESS_KEY_ID }}
          s3-secret-access-key: ${{ secrets.S3_ARTIFACT_SECRET_ACCESS_KEY }}
      - run: cat dist/message.txt
```

The same storage inputs are supported on both actions:

```yaml
with:
  s3-bucket: my-artifacts
  s3-endpoint: https://ACCOUNT_ID.r2.cloudflarestorage.com
  s3-region: auto
  s3-access-key-id: ${{ secrets.S3_ARTIFACT_ACCESS_KEY_ID }}
  s3-secret-access-key: ${{ secrets.S3_ARTIFACT_SECRET_ACCESS_KEY }}
```

For a jurisdiction-specific R2 bucket, use its corresponding endpoint. For AWS S3, omit `s3-endpoint` and use the bucket's region. Credentials are never embedded in manifests. Temporary AWS credentials can be passed as `s3-access-key-id`, `s3-secret-access-key`, and `s3-session-token` from an authentication step's outputs. Configure that step not to export environment credentials if you want to keep the entire job's AWS environment unchanged.

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

| Input                  | Default / behavior                        |
| ---------------------- | ----------------------------------------- |
| `s3-bucket`            | Unset selects native upload               |
| `s3-endpoint`          | Unset uses AWS S3                         |
| `s3-region`            | `auto`; specify the bucket region for AWS |
| `s3-prefix`            | `s3-artifacts`                            |
| `s3-force-path-style`  | `false`; useful for local S3 services     |
| `s3-access-key-id`     | Required with a bucket                    |
| `s3-secret-access-key` | Required with a bucket                    |
| `s3-session-token`     | Optional, for temporary AWS credentials   |

Configure the same bucket, prefix, and endpoint on upload and download. The actions do not read `AWS_*` credentials, `AWS_REGION`, `AWS_ENDPOINT_URL*`, or `S3_ARTIFACT_*` configuration from the environment. They do not use the SDK's default credential provider chain or export credentials to other steps. GitHub internally transports `with` inputs as action-specific `INPUT_*` variables; no global `AWS_*` variables are written.

**Migration from v0.2:** move storage settings and credentials from `env` to these `with` inputs. A bucket with missing credentials is a configuration error, not a transfer failure. Without `s3-bucket`, auto upload still uses native storage. The standalone lifecycle CLI continues to use its own documented CLI/environment configuration.

Reading an external manifest without external storage configuration is an error; it cannot restore a payload that was never backed up to GitHub.

To bypass external storage for one upload even when storage inputs are set:

```yaml
- uses: rwv/s3-artifact/upload@v0.3.0
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
- `manifest`: compact JSON for direct handoff to the download action.

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
      - uses: rwv/s3-artifact/upload@v0.3.0
        id: upload
        with:
          name: build
          path: dist/

  consume:
    needs: build
    runs-on: ubuntu-latest
    steps:
      # Configure the same storage on this job when using S3/R2.
      - uses: rwv/s3-artifact/download@v0.3.0
        with:
          manifest: ${{ needs.build.outputs.manifest }}
          path: dist/
```

Native storage and upload fallback emit a descriptor containing the native artifact ID and available digest. Download uses that ID directly. A nonempty `manifest` is mutually exclusive with `name`, `artifact-ids`, and `pattern`; it represents one artifact extracted directly into `path`. Empty input retains the usual discovery flow. Invalid nonempty input fails without discovery fallback.

The descriptor contains no credentials or endpoint. External downloads still validate expiry, bucket/prefix, size, and SHA-256. Treat the descriptor as trusted workflow data: checksums detect corruption, not malicious modification of both payload and descriptor. Cross-run native downloads still require the appropriate `github-token`, `repository`, and `run-id` inputs.

Native direct handoff skips this action's discovery call, but the official artifact SDK may still query metadata internally when downloading by ID. External direct handoff makes no GitHub artifact API calls during download.
