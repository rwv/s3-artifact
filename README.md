# s3-artifact

[![CI](https://github.com/rwv/s3-artifact/actions/workflows/ci.yml/badge.svg)](https://github.com/rwv/s3-artifact/actions/workflows/ci.yml)

GitHub Actions artifact upload and download with **S3 or Cloudflare R2 storage**. Built for passing large build outputs between jobs, especially on self-hosted runners.

Payloads live in your bucket. GitHub stores a small manifest for discovery. Upload can fall back to native GitHub storage when external storage is unavailable.

## Quick start

Create a private bucket and [configure lifecycle once](docs/lifecycle.md). Add repository variables for the bucket and endpoint, and GitHub Secrets for the bucket's access key and secret key.

This R2 example passes the manifest directly between jobs, skipping GitHub artifact lookup during download:

```yaml
name: Build
on: push
permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      manifest: ${{ steps.upload.outputs.manifest }}
    steps:
      - run: |
          mkdir -p dist
          echo hello > dist/message.txt
      - uses: rwv/s3-artifact/upload@v1
        id: upload
        with:
          name: build
          path: dist/
          s3-bucket: ${{ vars.S3_ARTIFACT_BUCKET }}
          s3-endpoint: ${{ vars.S3_ARTIFACT_ENDPOINT }}
          s3-region: auto
          s3-access-key-id: ${{ secrets.S3_ARTIFACT_ACCESS_KEY_ID }}
          s3-secret-access-key: ${{ secrets.S3_ARTIFACT_SECRET_ACCESS_KEY }}

  consume:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: rwv/s3-artifact/download@v1
        with:
          manifest: ${{ needs.build.outputs.manifest }}
          path: dist/
          s3-bucket: ${{ vars.S3_ARTIFACT_BUCKET }}
          s3-endpoint: ${{ vars.S3_ARTIFACT_ENDPOINT }}
          s3-region: auto
          s3-access-key-id: ${{ secrets.S3_ARTIFACT_ACCESS_KEY_ID }}
          s3-secret-access-key: ${{ secrets.S3_ARTIFACT_SECRET_ACCESS_KEY }}
      - run: cat dist/message.txt
```

For AWS S3, omit `s3-endpoint` and set `s3-region` to the bucket's region. Temporary credentials also accept `s3-session-token`. All storage configuration goes in `with`; the actions do not inherit or export AWS credentials.

To use discovery instead, replace the download's `manifest` input with `name: build`. To force native GitHub storage, set `storage: github` on upload.

Pin `@v1.0.0` or a commit SHA if you prefer a fixed release.

## Upload inputs

| Input                  | Default    | Description                                                              |
| ---------------------- | ---------- | ------------------------------------------------------------------------ |
| `name`                 | `artifact` | Logical artifact name                                                    |
| `path`                 | Required   | File, directory, or multiline globs; supports `!` exclusions             |
| `storage`              | `auto`     | `auto`, `github` (bypass S3), or `s3` (require a bucket)                 |
| `fallback`             | `true`     | Use GitHub storage when no bucket is configured or external upload fails |
| `retention-days`       | `0`        | `0` selects 30 days; accepts 1–90, capped by repository retention        |
| `compression-level`    | `6`        | ZIP level 0–9; use 0 for already-compressed files                        |
| `archive`              | `true`     | `false` uploads one file using its basename as the artifact name         |
| `overwrite`            | `false`    | Replace visible artifacts with the same logical name                     |
| `include-hidden-files` | `false`    | Include hidden files                                                     |
| `if-no-files-found`    | `warn`     | `warn`, `error`, or `ignore`                                             |

## Download inputs

| Input             | Default            | Description                                                |
| ----------------- | ------------------ | ---------------------------------------------------------- |
| `manifest`        | Unset              | JSON from upload; selects one artifact without discovery   |
| `name`            | Unset              | Select one logical artifact                                |
| `artifact-ids`    | Unset              | Comma-separated GitHub artifact IDs; exclusive with `name` |
| `pattern`         | Unset              | Match logical names; ignored with name or IDs              |
| `path`            | Workspace          | Destination directory; supports `~/`                       |
| `merge-multiple`  | `false`            | Extract multiple artifacts into the same directory         |
| `github-token`    | Unset              | Token with `actions:read` for another run or repository    |
| `repository`      | Current repository | Repository to query with `github-token`                    |
| `run-id`          | Current run        | Run to query with `github-token`                           |
| `skip-decompress` | `false`            | Keep the downloaded ZIP or raw file                        |
| `digest-mismatch` | `error`            | `error`, `warn`, `info`, or `ignore`                       |

A nonempty `manifest` is exclusive with `name`, `artifact-ids`, and `pattern`. Without any selector, download retrieves all artifacts. Empty `manifest` uses discovery; invalid JSON fails.

## Shared storage inputs

| Input                  | Default / description                     |
| ---------------------- | ----------------------------------------- |
| `s3-bucket`            | Bucket name; unset selects native upload  |
| `s3-endpoint`          | S3-compatible endpoint; omit for AWS S3   |
| `s3-region`            | `auto` for R2; specify the region for AWS |
| `s3-prefix`            | `s3-artifacts`                            |
| `s3-force-path-style`  | `false`; useful for local S3 services     |
| `s3-access-key-id`     | Required for external storage             |
| `s3-secret-access-key` | Required for external storage             |
| `s3-session-token`     | Optional temporary credential token       |

Use the same bucket, endpoint, and prefix on both jobs. Native-only downloads ignore these inputs. Migrating from v0.2? Move AWS/S3 environment settings into `with`.

## Outputs

Upload provides `artifact-id`, `artifact-url`, `artifact-digest`, `payload-digest`, `storage-backend`, and `manifest`. Download provides `download-path`.

For external storage, the GitHub ID, URL, and digest describe the manifest artifact. `payload-digest` is the actual payload's SHA-256. Native uploads also emit a manifest containing their artifact ID, so direct handoff works after fallback.

## Storage and compatibility

- Logical `build` appears in GitHub as `build.s3-artifact`, containing `build.s3-artifact.manifest.json`. GitHub UI and official download tools retrieve that metadata; this action retrieves the payload.
- Object keys include repository ID, run ID, attempt, and a UUID. Use unique names for parallel producers.
- External downloads verify expiry, size, and SHA-256. Interrupted network streams restart up to twice.
- Upload falls back on external transfer failure, but not invalid inputs or failed manifest publication. There is no second payload copy for download fallback.
- ZIP is the default; package a tar file first to preserve executable permissions or symlinks.

Inputs follow `actions/upload-artifact` v7 and `actions/download-artifact` v8. See [compatibility](docs/compatibility.md) for reruns, overwrite, and retention details.

## Development

Requires Node 24, pnpm 10.28.2, and Docker.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:storage
pnpm build
pnpm check
```

CI checks Linux, Windows, and macOS. Storage integration tests use local RustFS; real AWS/R2 throughput is not benchmarked. See [contributing](CONTRIBUTING.md) and [tests](docs/testing.md).

## License

[MIT](LICENSE). An independent project by rwv. Dependency licenses are in [third-party notices](THIRD_PARTY_NOTICES.txt).
