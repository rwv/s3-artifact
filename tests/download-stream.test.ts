import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { getPayload } from "../packages/core/src/storage.ts";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "artifact-retry-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
function interrupted(code: string): Readable {
  return Readable.from(
    (async function* () {
      yield Buffer.from("partial contents longer than the final payload");
      throw Object.assign(new Error("interrupted"), { code });
    })(),
  );
}
it("restarts an interrupted download and truncates partial data", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce({ Body: interrupted("ECONNRESET") })
    .mockResolvedValueOnce({ Body: Readable.from(["complete"]) });
  const file = path.join(directory, "payload");
  await getPayload({ send } as unknown as S3Client, "ci", "key", file);
  expect(send).toHaveBeenCalledTimes(2);
  expect(await readFile(file, "utf8")).toBe("complete");
});
it("limits interrupted stream downloads to three attempts", async () => {
  const send = vi
    .fn()
    .mockImplementation(async () => ({ Body: interrupted("ERR_STREAM_PREMATURE_CLOSE") }));
  await expect(
    getPayload({ send } as unknown as S3Client, "ci", "key", path.join(directory, "payload")),
  ).rejects.toThrow("interrupted");
  expect(send).toHaveBeenCalledTimes(3);
});
it("does not retry non-network stream errors or failed SDK requests", async () => {
  const send = vi.fn().mockResolvedValueOnce({ Body: interrupted("EACCES") });
  await expect(
    getPayload({ send } as unknown as S3Client, "ci", "key", path.join(directory, "payload")),
  ).rejects.toThrow("interrupted");
  expect(send).toHaveBeenCalledTimes(1);
  send.mockClear().mockRejectedValueOnce(new Error("AccessDenied"));
  await expect(
    getPayload({ send } as unknown as S3Client, "ci", "key", path.join(directory, "payload")),
  ).rejects.toThrow("AccessDenied");
  expect(send).toHaveBeenCalledTimes(1);
});
