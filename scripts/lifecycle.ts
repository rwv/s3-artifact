import { writeFile } from "node:fs/promises";
import {
  S3Client,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import type { LifecycleRule } from "@aws-sdk/client-s3";
import { storagePrefix } from "../packages/core/src/model.ts";

const [command = "generate", ...args] = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
}
const prefix = storagePrefix(option("prefix") || process.env.S3_ARTIFACT_PREFIX || "s3-artifacts");
const rules: LifecycleRule[] = Array.from({ length: 90 }, (_, i) => ({
  ID: `s3-artifact:${prefix}:ttl-${i + 1}`,
  Status: "Enabled",
  Filter: { Prefix: `${prefix}/v1/ttl-${String(i + 1).padStart(3, "0")}/` },
  Expiration: { Days: i + 2 },
}));
rules.push({
  ID: `s3-artifact:${prefix}:multipart`,
  Status: "Enabled",
  Filter: { Prefix: `${prefix}/v1/` },
  AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
});
if (command === "generate") {
  const document = `${JSON.stringify({ Rules: rules }, null, 2)}\n`;
  const output = option("output");
  if (output) await writeFile(output, document);
  else process.stdout.write(document);
} else if (command === "check" || command === "apply") {
  const bucket = option("bucket") || process.env.S3_ARTIFACT_BUCKET;
  if (!bucket) throw new Error("Provide --bucket or S3_ARTIFACT_BUCKET.");
  const endpoint = option("endpoint") || process.env.S3_ARTIFACT_ENDPOINT;
  const client = new S3Client({
    region: option("region") || process.env.AWS_REGION || "auto",
    ...(endpoint ? { endpoint } : {}),
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  try {
    let existing: LifecycleRule[] = [];
    try {
      existing =
        (await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))).Rules ??
        [];
    } catch (error) {
      if ((error as Error).name !== "NoSuchLifecycleConfiguration") throw error;
    }
    const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    const matches = (expected: LifecycleRule): boolean =>
      existing.some(
        (actual) =>
          actual.ID === expected.ID &&
          actual.Status === expected.Status &&
          same(actual.Filter, expected.Filter) &&
          same(actual.Expiration, expected.Expiration) &&
          same(actual.AbortIncompleteMultipartUpload, expected.AbortIncompleteMultipartUpload),
      );
    if (command === "check") {
      const missing = rules.filter((r) => !matches(r));
      if (missing.length)
        throw new Error(
          `${missing.length} managed lifecycle rules are missing or different. Run apply after reviewing generate output.`,
        );
      console.log(
        "All managed lifecycle rules match. Review other bucket rules for overlapping expiration policies.",
      );
    } else {
      const backup = option("backup");
      if (!backup)
        throw new Error("apply requires --backup <file> to preserve the previous configuration.");
      // Refuse to overwrite an existing backup file.
      await writeFile(backup, JSON.stringify({ Rules: existing }, null, 2), { flag: "wx" });
      const merged = [
        ...existing.filter((r) => !r.ID?.startsWith(`s3-artifact:${prefix}:`)),
        ...rules,
      ];
      if (merged.length > 1000)
        throw new Error("Merged lifecycle configuration exceeds 1,000 rules.");
      await client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: bucket,
          LifecycleConfiguration: { Rules: merged },
        }),
      );
      console.log(
        `Applied ${rules.length} managed rules; preserved unrelated rules. Backup: ${backup}`,
      );
    }
  } finally {
    client.destroy();
  }
} else if (command === "help") {
  console.log(
    "pnpm lifecycle generate|check|apply [--prefix PREFIX] [--bucket BUCKET] [--endpoint URL] [--region REGION] [--output FILE] [--backup FILE]",
  );
} else {
  throw new Error(`Unknown lifecycle command: ${command}`);
}
