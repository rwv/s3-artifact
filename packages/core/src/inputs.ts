import * as core from "@actions/core";
import { homedir } from "node:os";
import path from "node:path";
import { storagePrefix } from "./model.ts";
import type { StorageConfig } from "./storage.ts";

export function booleanInput(name: string, defaultValue: boolean): boolean {
  return core.getInput(name) ? core.getBooleanInput(name) : defaultValue;
}
export function storageConfig(): StorageConfig | undefined {
  const bucket = core.getInput("s3-bucket");
  if (!bucket) return undefined;
  const endpoint = core.getInput("s3-endpoint");
  const prefix = storagePrefix(core.getInput("s3-prefix") || "s3-artifacts");
  const accessKeyId = core.getInput("s3-access-key-id");
  const secretAccessKey = core.getInput("s3-secret-access-key");
  const sessionToken = core.getInput("s3-session-token");
  for (const value of [accessKeyId, secretAccessKey, sessionToken]) {
    if (value) core.setSecret(value);
  }
  if (!accessKeyId || !secretAccessKey)
    throw new Error(
      "A configured s3-bucket requires s3-access-key-id and s3-secret-access-key inputs.",
    );
  return {
    credentials: { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) },
    bucket,
    prefix,
    region: core.getInput("s3-region") || "auto",
    forcePathStyle: booleanInput("s3-force-path-style", false),
    ...(endpoint ? { endpoint } : {}),
  };
}
export function destinationPath(): string {
  const value = core.getInput("path") || process.env.GITHUB_WORKSPACE || process.cwd();
  return path.resolve(
    value === "~"
      ? homedir()
      : value.startsWith("~/")
        ? path.join(homedir(), value.slice(2))
        : value,
  );
}
export function handleDigestMismatch(mismatch: boolean, behavior: string, label: string): void {
  if (!mismatch) return;
  const message = `SHA-256 mismatch for ${label}.`;
  if (behavior === "error") throw new Error(message);
  if (behavior === "warn") core.warning(message);
  if (behavior === "info") core.info(message);
}
