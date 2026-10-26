import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Artifact, UploadArtifactOptions, DownloadArtifactOptions } from "@actions/artifact";
const mocks = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  outputs: {} as Record<string, unknown>,
  list: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  deletePayload: vi.fn(),
}));
vi.mock("@actions/core", () => ({
  getInput: (key: string) => mocks.inputs[key] ?? "",
  getBooleanInput: (key: string) => mocks.inputs[key] === "true",
  setOutput: (key: string, value: unknown) => {
    mocks.outputs[key] = value;
  },
  info: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@actions/artifact", () => ({
  default: {
    listArtifacts: mocks.list,
    uploadArtifact: mocks.upload,
    downloadArtifact: mocks.download,
    deleteArtifact: mocks.remove,
  },
}));
vi.mock("../packages/core/src/storage.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../packages/core/src/storage.ts")>()),
  createStorage: () => ({ destroy: vi.fn() }),
  putPayload: mocks.put,
  getPayload: mocks.get,
  deletePayload: mocks.deletePayload,
}));
import { run as upload } from "../upload/src/run.ts";
import { run as download } from "../download/src/run.ts";
import { zipFiles, extractZip, digestFile } from "../packages/core/src/files.ts";
let directory: string;
let artifacts: Artifact[];
let payloads: Map<string, Buffer>;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.inputs = {};
  mocks.outputs = {};
  artifacts = [];
  payloads = new Map();
  directory = await mkdtemp(path.join(tmpdir(), "s3-artifact-action-"));
  await mkdir(path.join(directory, "source", "nested"), { recursive: true });
  await writeFile(path.join(directory, "source", "nested", "file.txt"), "hello");
  vi.stubEnv("GITHUB_REPOSITORY_ID", "123");
  vi.stubEnv("GITHUB_REPOSITORY", "rwv/s3-artifact");
  vi.stubEnv("GITHUB_RUN_ID", "456");
  vi.stubEnv("GITHUB_RUN_ATTEMPT", "2");
  vi.stubEnv("GITHUB_RETENTION_DAYS", "90");
  vi.stubEnv("S3_ARTIFACT_BUCKET", "");
  mocks.list.mockImplementation(() => Promise.resolve({ artifacts: [...artifacts] }));
  mocks.remove.mockImplementation((name: string) => {
    artifacts = artifacts.filter((a) => a.name !== name);
    return Promise.resolve({ id: 1 });
  });
  mocks.upload.mockImplementation(
    async (name: string, files: string[], root: string, options: UploadArtifactOptions) => {
      const id = (artifacts.at(-1)?.id ?? 0) + 1;
      const stored = path.join(directory, `${id}.zip`);
      if (options.skipArchive) await copyFile(files[0]!, stored);
      else await zipFiles(files, root, stored, 0);
      const digest = await digestFile(stored);
      artifacts.push({ id, name, size: 1, digest });
      return { id, digest };
    },
  );
  mocks.download.mockImplementation(async (id: number, options: DownloadArtifactOptions) => {
    await mkdir(options.path!, { recursive: true });
    await extractZip(path.join(directory, `${id}.zip`), options.path!);
    return { downloadPath: options.path, digestMismatch: false };
  });
  mocks.put.mockImplementation(
    async (_client: unknown, _bucket: string, key: string, file: string) => {
      payloads.set(key, await readFile(file));
    },
  );
  mocks.get.mockImplementation(
    async (_client: unknown, _bucket: string, key: string, file: string) => {
      await writeFile(file, payloads.get(key)!);
    },
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
function uploadInputs(external = true): void {
  mocks.inputs = {
    name: "build",
    path: path.join(directory, "source"),
    ...(external ? { "s3-bucket": "ci" } : {}),
  };
}
it("publishes a pointer and restores the external payload without exposing metadata", async () => {
  uploadInputs();
  await upload();
  expect(artifacts[0]?.name).toBe("build.s3-artifact");
  expect(mocks.outputs["storage-backend"]).toBe("s3");
  expect(mocks.outputs["artifact-digest"]).not.toBe(mocks.outputs["payload-digest"]);
  const target = path.join(directory, "out");
  mocks.inputs = { name: "build", path: target, "s3-bucket": "ci" };
  await download();
  expect(await readFile(path.join(target, "nested", "file.txt"), "utf8")).toBe("hello");
});
it("falls back only when external transfer fails and publishes the original file layout", async () => {
  uploadInputs();
  mocks.put.mockRejectedValueOnce(new Error("network unavailable"));
  await upload();
  expect(artifacts[0]?.name).toBe("build");
  expect(mocks.outputs["storage-backend"]).toBe("github");
  mocks.inputs = { name: "build", path: path.join(directory, "out") };
  await download();
  expect(await readFile(path.join(directory, "out", "nested", "file.txt"), "utf8")).toBe("hello");
});
it("does not fall back after pointer publication fails", async () => {
  uploadInputs();
  mocks.upload.mockRejectedValueOnce(new Error("GitHub unavailable"));
  await expect(upload()).rejects.toThrow("GitHub unavailable");
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(mocks.deletePayload).toHaveBeenCalledTimes(1);
});
it("supports mixed-backend downloads and raw external payloads", async () => {
  uploadInputs();
  await upload();
  uploadInputs(false);
  mocks.inputs.name = "native";
  await upload();
  mocks.inputs = {
    path: path.join(directory, "source", "nested", "file.txt"),
    archive: "false",
    "s3-bucket": "ci",
  };
  await upload();
  mocks.inputs = { path: path.join(directory, "out"), "s3-bucket": "ci" };
  await download();
  expect(await readFile(path.join(directory, "out", "build", "nested", "file.txt"), "utf8")).toBe(
    "hello",
  );
  expect(await readFile(path.join(directory, "out", "native", "nested", "file.txt"), "utf8")).toBe(
    "hello",
  );
  expect(await readFile(path.join(directory, "out", "file.txt", "file.txt"), "utf8")).toBe("hello");
});
it("rejects duplicate logical names across backends unless overwrite is set", async () => {
  uploadInputs(false);
  await upload();
  uploadInputs();
  await expect(upload()).rejects.toThrow("already exists");
  mocks.inputs.overwrite = "true";
  await upload();
  expect(artifacts.map((a) => a.name)).toEqual(["build.s3-artifact"]);
});
it("does not report success for a corrupt external payload", async () => {
  uploadInputs();
  await upload();
  for (const [key, value] of payloads) payloads.set(key, Buffer.alloc(value.length));
  mocks.inputs = { name: "build", path: path.join(directory, "out"), "s3-bucket": "ci" };
  await expect(download()).rejects.toThrow("SHA-256 mismatch");
});

it("explicit GitHub storage skips even invalid external configuration", async () => {
  uploadInputs();
  mocks.inputs.storage = "github";
  mocks.inputs["s3-prefix"] = "../invalid";
  mocks.inputs.fallback = "false";
  await upload();
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.outputs["storage-backend"]).toBe("github");
  expect(artifacts[0]?.name).toBe("build");
});
it("explicit S3 selection requires a configured bucket", async () => {
  uploadInputs(false);
  mocks.inputs.storage = "s3";
  await expect(upload()).rejects.toThrow("requires a configured bucket");
  expect(mocks.upload).not.toHaveBeenCalled();
});

it.each(["s3", "github", "fallback"])(
  "downloads a %s handoff without discovery",
  async (backend) => {
    uploadInputs();
    if (backend === "github") mocks.inputs.storage = "github";
    if (backend === "fallback") mocks.put.mockRejectedValueOnce(new Error("unavailable"));
    await upload();
    const manifest = String(mocks.outputs.manifest);
    mocks.list.mockClear();
    mocks.inputs = { manifest, path: path.join(directory, "direct"), "s3-bucket": "ci" };
    await download();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.download).toHaveBeenCalledTimes(backend === "s3" ? 0 : 1);
    expect(await readFile(path.join(directory, "direct", "nested", "file.txt"), "utf8")).toBe(
      "hello",
    );
  },
);
it("rejects invalid or conflicting handoffs without discovery", async () => {
  for (const manifest of [
    "not-json",
    "null",
    '{"kind":"github-artifact","schemaVersion":2}',
    '{"kind":"github-artifact","schemaVersion":1,"name":"build","artifactId":0}',
  ]) {
    mocks.inputs = { manifest };
    await expect(download()).rejects.toThrow();
  }
  uploadInputs();
  await upload();
  mocks.list.mockClear();
  for (const key of ["name", "artifact-ids", "pattern"]) {
    mocks.inputs = { manifest: String(mocks.outputs.manifest), [key]: "build" };
    await expect(download()).rejects.toThrow("mutually exclusive");
  }
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
});
it("enforces expiry, storage scope, and payload integrity for direct handoffs", async () => {
  uploadInputs();
  await upload();
  const original = JSON.parse(String(mocks.outputs.manifest));
  for (const [patch, error] of [
    [{ expiresAt: "2000-01-01T00:00:00Z" }, "expired"],
    [{ bucket: "other" }, "bucket/prefix"],
    [{ size: original.size + 1 }, "size mismatch"],
    [{ sha256: "0".repeat(64) }, "SHA-256 mismatch"],
  ] as const) {
    mocks.inputs = {
      manifest: JSON.stringify({ ...original, ...patch }),
      path: path.join(directory, "out"),
      "s3-bucket": "ci",
    };
    await expect(download()).rejects.toThrow(error);
  }
  expect(mocks.download).not.toHaveBeenCalled();
});
