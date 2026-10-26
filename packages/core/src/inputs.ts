import * as core from "@actions/core";
import { homedir } from "node:os";
import path from "node:path";
import { storagePrefix } from "./model.ts";
import type { StorageConfig } from "./storage.ts";

export function booleanInput(name: string, defaultValue: boolean): boolean {
  return core.getInput(name) ? core.getBooleanInput(name) : defaultValue;
}
export function storageConfig(): StorageConfig | undefined {
  const bucket = core.getInput("s3-bucket") || process.env.S3_ARTIFACT_BUCKET;
  if (!bucket) return undefined;
  const endpoint = core.getInput("s3-endpoint") || process.env.S3_ARTIFACT_ENDPOINT;
  const prefix = storagePrefix(
    core.getInput("s3-prefix") || process.env.S3_ARTIFACT_PREFIX || "s3-artifacts",
  );
  return {
    bucket,
    prefix,
    region: core.getInput("s3-region") || process.env.AWS_REGION || "auto",
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
