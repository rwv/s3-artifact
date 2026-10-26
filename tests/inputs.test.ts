import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GetObjectCommand } from "@aws-sdk/client-s3";
const mocks = vi.hoisted(() => ({ inputs: {} as Record<string, string>, mask: vi.fn() }));
vi.mock("@actions/core", () => ({
  getInput: (key: string) => mocks.inputs[key] ?? "",
  getBooleanInput: (key: string) => mocks.inputs[key] === "true",
  setSecret: mocks.mask,
}));
import { storageConfig } from "../packages/core/src/inputs.ts";
import { createStorage } from "../packages/core/src/storage.ts";

beforeEach(() => {
  mocks.inputs = {};
  mocks.mask.mockClear();
  vi.stubEnv("S3_ARTIFACT_BUCKET", "unrelated-bucket");
  vi.stubEnv("S3_ARTIFACT_PREFIX", "unrelated-prefix");
  vi.stubEnv("S3_ARTIFACT_ENDPOINT", "https://unrelated.invalid");
  vi.stubEnv("AWS_REGION", "unrelated-region");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "unrelated-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "unrelated-secret");
  vi.stubEnv("AWS_SESSION_TOKEN", "unrelated-token");
  vi.stubEnv("AWS_ENDPOINT_URL", "https://unrelated.invalid");
  vi.stubEnv("AWS_ENDPOINT_URL_S3", "https://unrelated.invalid");
});
afterEach(() => vi.unstubAllEnvs());

it("ignores ambient storage configuration and requires explicit credentials", () => {
  expect(storageConfig()).toBeUndefined();
  mocks.inputs = { "s3-bucket": "ci" };
  expect(() => storageConfig()).toThrow("requires s3-access-key-id");
  mocks.inputs["s3-access-key-id"] = "local-key";
  expect(() => storageConfig()).toThrow("requires s3-access-key-id");
});

it("scopes credentials and endpoint to the client without changing AWS environment", async () => {
  const before = { ...process.env };
  mocks.inputs = {
    "s3-bucket": "ci",
    "s3-access-key-id": "local-key",
    "s3-secret-access-key": "local-secret",
    "s3-session-token": "local-session",
    "s3-region": "us-east-1",
  };
  const config = storageConfig()!;
  expect(config.prefix).toBe("s3-artifacts");
  expect(config.endpoint).toBeUndefined();
  expect(mocks.mask.mock.calls.map(([value]) => value)).toEqual([
    "local-key",
    "local-secret",
    "local-session",
  ]);
  const client = createStorage(config);
  try {
    expect(await client.config.credentials()).toMatchObject({
      accessKeyId: "local-key",
      secretAccessKey: "local-secret",
      sessionToken: "local-session",
    });
    let hostname;
    client.middlewareStack.add(
      () => async (args) => {
        hostname = (args.request as { hostname: string }).hostname;
        // Stop before signing/network I/O; exercise the actual SDK endpoint resolver.
        return { response: {}, output: { $metadata: {} } };
      },
      { step: "build", name: "captureEndpoint" },
    );
    await client.send(new GetObjectCommand({ Bucket: "ci", Key: "payload" }));
    expect(hostname).toBe("s3.us-east-1.amazonaws.com");
  } finally {
    client.destroy();
  }
  expect(process.env).toEqual(before);
});

it("accepts R2 inputs without requiring a session token", () => {
  mocks.inputs = {
    "s3-bucket": "ci",
    "s3-endpoint": "https://example.r2.cloudflarestorage.com",
    "s3-access-key-id": "local-key",
    "s3-secret-access-key": "local-secret",
  };
  expect(storageConfig()).toMatchObject({
    region: "auto",
    endpoint: mocks.inputs["s3-endpoint"],
    credentials: { accessKeyId: "local-key", secretAccessKey: "local-secret" },
  });
  expect(storageConfig()!.credentials).not.toHaveProperty("sessionToken");
});
