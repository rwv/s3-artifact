import { beforeAll, afterAll, expect, it } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createStorage,
  putPayload,
  getPayload,
  deletePayload,
} from "../packages/core/src/storage.ts";
import { digestFile } from "../packages/core/src/files.ts";
const endpoint = process.env.LOCAL_S3_ENDPOINT;
if (!endpoint) throw new Error("Use pnpm test:storage to start the local test service.");
const client = createStorage({
  credentials: { accessKeyId: "rustfsadmin", secretAccessKey: "rustfsadmin" },
  bucket: "artifact-test",
  prefix: "s3-artifacts",
  region: "us-east-1",
  endpoint,
  forcePathStyle: true,
});
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "s3-artifact-storage-"));
  await client.send(new CreateBucketCommand({ Bucket: "artifact-test" }));
});
afterAll(async () => {
  await client.send(new DeleteBucketCommand({ Bucket: "artifact-test" }));
  client.destroy();
  await rm(directory, { recursive: true, force: true });
});
it("roundtrips a multipart payload through the actual SDK and local S3 server", async () => {
  const source = path.join(directory, "source");
  const destination = path.join(directory, "destination");
  const key = "s3-artifacts/v1/ttl-001/test/payload";
  await writeFile(source, randomBytes(20 * 1024 * 1024));
  try {
    await putPayload(client, "artifact-test", key, source, 20 * 1024 * 1024);
    await getPayload(client, "artifact-test", key, destination);
    expect(await digestFile(destination)).toBe(await digestFile(source));
  } finally {
    await deletePayload(client, "artifact-test", key);
  }
  await expect(getPayload(client, "artifact-test", key, destination)).rejects.toThrow();
});
it("applies and checks lifecycle rules while preserving unrelated rules", async () => {
  const old = {
    ID: "unrelated",
    Status: "Enabled" as const,
    Filter: { Prefix: "other/" },
    Expiration: { Days: 7 },
  };
  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: "artifact-test",
      LifecycleConfiguration: { Rules: [old] },
    }),
  );
  const run = promisify(execFile);
  const args = ["exec", "tsx", "scripts/lifecycle.ts"];
  const backup = path.join(directory, "backup.json");
  await run(
    "pnpm",
    [...args, "apply", "--bucket", "artifact-test", "--endpoint", endpoint!, "--backup", backup],
    { env: process.env },
  );
  await run("pnpm", [...args, "check", "--bucket", "artifact-test", "--endpoint", endpoint!], {
    env: process.env,
  });
  const result = await client.send(
    new GetBucketLifecycleConfigurationCommand({ Bucket: "artifact-test" }),
  );
  expect(result.Rules).toHaveLength(92);
  expect(result.Rules?.find((rule) => rule.ID === "unrelated")).toMatchObject(old);
  expect(JSON.parse(await readFile(backup, "utf8")).Rules).toHaveLength(1);
});
