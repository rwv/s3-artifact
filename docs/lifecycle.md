# Lifecycle setup

Configure lifecycle once, before external uploads. The runtime never changes bucket-level configuration. S3 and R2 use prefix rules, not object tags.

The CLI manages 90 expiration rules and one incomplete multipart-abort rule under the selected prefix. Logical retention N maps to physical expiration after N+1 days. This avoids expiring an object before the subsequently published manifest. Incomplete uploads are eligible for abort after one day.

From a checkout with dependencies installed:

```sh
pnpm lifecycle generate --output lifecycle.json
```

Review the generated rules. Apply them using provider tooling, or use this project's setup command with a bucket-management identity:

```sh
pnpm lifecycle apply --bucket my-artifacts \
  --endpoint https://ACCOUNT_ID.r2.cloudflarestorage.com \
  --backup lifecycle-before.json

pnpm lifecycle check --bucket my-artifacts \
  --endpoint https://ACCOUNT_ID.r2.cloudflarestorage.com
```

For AWS, omit `--endpoint` and specify `--region`. The CLI uses the standard AWS SDK credential chain. It never prints credentials. `--prefix` must match the runtime's `s3-prefix`/`S3_ARTIFACT_PREFIX` (default `s3-artifacts`).

`apply` requires a new backup path, preserves unrelated rules, and replaces only managed rule IDs for that prefix. Do not run multiple setup processes concurrently. `check` verifies managed rule definitions; it does not prove that unrelated overlapping rules cannot expire objects earlier. Review existing whole-bucket expiration rules before applying.

Missing lifecycle rules do not prevent uploads, but objects will not be cleaned up as intended. Missing read access to lifecycle is not a runtime error because ordinary upload/download jobs do not inspect lifecycle.

For AWS buckets with versioning, separately configure noncurrent-version and delete-marker cleanup. These managed rules do not remove historical versions. R2 and AWS expiration are asynchronous; no exact deletion-time guarantee is made.
