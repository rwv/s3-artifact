import { Minimatch } from "minimatch";
import type { Artifact } from "@actions/artifact";

export const SUFFIX = ".s3-artifact";
export const DAY = 86_400_000;
export interface Manifest {
  kind: "s3-artifact";
  schemaVersion: 1;
  name: string;
  bucket: string;
  key: string;
  format: "zip" | "raw";
  filename: string;
  size: number;
  sha256: string;
  repositoryId: string;
  runId: string;
  runAttempt: string;
  createdAt: string;
  expiresAt: string;
}
export function validateName(name: string): void {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    // eslint-disable-next-line no-control-regex -- GitHub artifact names reject control characters.
    /["<>|:*?\\/\x00-\x1f]/u.test(name) ||
    name.endsWith(SUFFIX) ||
    name.length + SUFFIX.length > 255
  ) {
    throw new Error(
      "Artifact name must be a safe filename, fit within 255 characters including the reserved .s3-artifact suffix, and not end with that suffix.",
    );
  }
}
export function logicalName(name: string): string {
  return name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name;
}
export function retentionDays(input: string, repositoryLimit = "90"): number {
  const n = input === "" || input === "0" ? 30 : Number(input);
  if (!Number.isInteger(n) || n < 1 || n > 90)
    throw new Error("retention-days must be 0 (default) or an integer from 1 through 90.");
  const limit = Number(repositoryLimit);
  return Math.min(n, Number.isInteger(limit) && limit > 0 ? limit : 90);
}
export function storagePrefix(prefix: string): string {
  const value = prefix.replace(/^\/+|\/+$/gu, "");
  if (!value || value.split("/").some((p) => p === "." || p === ".."))
    throw new Error("s3-prefix must be a nonempty object prefix without dot segments.");
  return value;
}
export function selectArtifacts(
  artifacts: Artifact[],
  options: { name?: string; ids?: number[]; pattern?: string },
): Artifact[] {
  if (options.name && options.ids?.length)
    throw new Error("name and artifact-ids are mutually exclusive.");
  if (options.ids?.length) {
    const selected = options.ids.map((id) => {
      const artifact = artifacts.find((a) => a.id === id);
      if (!artifact) throw new Error(`Artifact ID ${id} was not found in this run.`);
      return artifact;
    });
    return [...new Map(selected.map((a) => [a.id, a])).values()];
  }
  const latest = new Map<string, Artifact>();
  for (const artifact of [...artifacts].sort((a, b) => b.id - a.id)) {
    const name = logicalName(artifact.name);
    if (!latest.has(name)) latest.set(name, artifact);
  }
  if (options.name) {
    const found = latest.get(options.name);
    if (!found) throw new Error(`Artifact '${options.name}' was not found.`);
    return [found];
  }
  const matcher = options.pattern ? new Minimatch(options.pattern) : undefined;
  return [...latest.values()].filter((a) => !matcher || matcher.match(logicalName(a.name)));
}
export function parseManifest(value: unknown, name: string): Manifest {
  if (!value || typeof value !== "object") throw new Error("Invalid s3-artifact manifest.");
  const m = value as Record<string, unknown>;
  if (m.kind !== "s3-artifact" || m.schemaVersion !== 1)
    throw new Error(
      "Unsupported s3-artifact manifest. Upgrade the action to a compatible version.",
    );
  const strings = [
    "name",
    "bucket",
    "key",
    "filename",
    "sha256",
    "repositoryId",
    "runId",
    "runAttempt",
    "createdAt",
    "expiresAt",
  ];
  if (
    strings.some((k) => typeof m[k] !== "string" || !m[k]) ||
    m.name !== name ||
    !["zip", "raw"].includes(String(m.format)) ||
    !Number.isSafeInteger(m.size) ||
    Number(m.size) < 0 ||
    !/^[a-f0-9]{64}$/u.test(String(m.sha256)) ||
    !Number.isFinite(Date.parse(String(m.createdAt))) ||
    !Number.isFinite(Date.parse(String(m.expiresAt)))
  )
    throw new Error("Invalid s3-artifact manifest fields.");
  validateName(name);
  if (/[\\/]/u.test(String(m.filename)) || m.filename === "." || m.filename === "..")
    throw new Error("Unsafe payload filename.");
  return m as unknown as Manifest;
}
