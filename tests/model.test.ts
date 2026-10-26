import { describe, expect, it } from "vitest";
import {
  selectArtifacts,
  retentionDays,
  parseManifest,
  validateName,
  DAY,
} from "../packages/core/src/model.ts";
import type { Manifest } from "../packages/core/src/model.ts";
const items = [
  { id: 10, name: "build.s3-artifact", size: 100 },
  { id: 20, name: "build", size: 200 },
  { id: 30, name: "test.s3-artifact", size: 100 },
];
describe("logical artifact discovery", () => {
  it("selects a newer native fallback instead of an old external pointer", () => {
    expect(selectArtifacts(items, { name: "build" }).map((a) => a.id)).toEqual([20]);
  });
  it("selects the exact ID even when a newer logical artifact exists", () => {
    expect(selectArtifacts(items, { ids: [10] }).map((a) => a.id)).toEqual([10]);
  });
  it("matches patterns on logical names and deduplicates all downloads", () => {
    expect(selectArtifacts(items, { pattern: "b*" }).map((a) => a.id)).toEqual([20]);
    expect(selectArtifacts(items, {}).map((a) => a.id)).toEqual([30, 20]);
  });
  it("rejects missing IDs rather than silently omitting them", () => {
    expect(() => selectArtifacts(items, { ids: [99] })).toThrow("not found");
  });
});
it("resolves the retention default and repository cap", () => {
  expect(retentionDays("")).toBe(30);
  expect(retentionDays("0", "7")).toBe(7);
  expect(retentionDays("90")).toBe(90);
  for (const input of ["-1", "91", "1.5", "forever"]) expect(() => retentionDays(input)).toThrow();
});
it("reserves the manifest suffix and rejects path-like names", () => {
  for (const name of ["../build", "build.s3-artifact", "a\\b", ""])
    expect(() => validateName(name)).toThrow();
  expect(() => validateName("build-linux")).not.toThrow();
});
it("validates protocol version, identity, digest, and filenames", () => {
  const m: Manifest = {
    kind: "s3-artifact",
    schemaVersion: 1,
    name: "build",
    bucket: "ci",
    key: "s3-artifacts/v1/key",
    format: "zip",
    filename: "build.zip",
    size: 42,
    sha256: "a".repeat(64),
    repositoryId: "1",
    runId: "2",
    runAttempt: "1",
    createdAt: new Date(0).toISOString(),
    expiresAt: new Date(DAY).toISOString(),
  };
  expect(parseManifest(m, "build")).toEqual(m);
  expect(() => parseManifest({ ...m, schemaVersion: 2 }, "build")).toThrow("Upgrade");
  expect(() => parseManifest({ ...m, filename: "../escape" }, "build")).toThrow("Unsafe");
  expect(() => parseManifest({ ...m, sha256: "etag" }, "build")).toThrow();
});
