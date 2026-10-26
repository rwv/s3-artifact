import * as core from "@actions/core";
import artifact from "@actions/artifact";
import type { UploadArtifactResponse } from "@actions/artifact";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  SUFFIX,
  DAY,
  validateName,
  logicalName,
  retentionDays,
  discover,
  zipFiles,
  digestFile,
  createStorage,
  putPayload,
  deletePayload,
  storageConfig,
  booleanInput,
} from "../../packages/core/src/index.ts";
import type { Manifest } from "../../packages/core/src/index.ts";

export async function run(): Promise<void> {
  const started = Date.now();
  const archive = booleanInput("archive", true);
  const compressionLevel = Number(core.getInput("compression-level") || "6");
  if (!Number.isInteger(compressionLevel) || compressionLevel < 0 || compressionLevel > 9)
    throw new Error("compression-level must be an integer from 0 through 9.");
  const days = retentionDays(core.getInput("retention-days"), process.env.GITHUB_RETENTION_DAYS);
  const ifMissing = core.getInput("if-no-files-found") || "warn";
  if (!["warn", "error", "ignore"].includes(ifMissing))
    throw new Error("if-no-files-found must be warn, error, or ignore.");
  const { files, root } = await discover(
    core.getInput("path", { required: true }),
    booleanInput("include-hidden-files", false),
  );
  if (!files.length) {
    if (ifMissing === "error") throw new Error("No files were found for the provided path.");
    if (ifMissing === "warn") core.warning("No files were found for the provided path.");
    return;
  }
  if (!archive && files.length !== 1) throw new Error("archive: false requires exactly one file.");
  const name = archive ? core.getInput("name") || "artifact" : path.basename(files[0]!);
  validateName(name);
  const mode = core.getInput("storage") || "auto";
  if (!["auto", "github", "s3"].includes(mode))
    throw new Error("storage must be auto, github, or s3.");
  const config = mode === "github" ? undefined : storageConfig();
  const fallback = booleanInput("fallback", true);
  if (mode === "s3" && !config) throw new Error("storage: s3 requires a configured bucket.");
  if (!config && !fallback && mode !== "github")
    throw new Error("External storage is not configured and fallback is disabled.");
  const overwrite = booleanInput("overwrite", false);
  const { artifacts: existing } = await artifact.listArtifacts({ latest: true });
  const conflicts = existing.filter((a) => logicalName(a.name) === name);
  if (conflicts.length && !overwrite)
    throw new Error(`Artifact '${name}' already exists. Use overwrite: true or a unique name.`);
  if (overwrite) for (const conflict of conflicts) await artifact.deleteArtifact(conflict.name);
  const options = { retentionDays: days, compressionLevel, skipArchive: !archive };
  async function nativeUpload(): Promise<void> {
    const result = await artifact.uploadArtifact(name, files, root, options);
    report(result, "github", result.digest ?? "");
    core.setOutput(
      "manifest",
      JSON.stringify({
        kind: "github-artifact",
        schemaVersion: 1,
        name,
        artifactId: result.id,
        ...(result.digest ? { sha256: result.digest } : {}),
      }),
    );
  }
  function report(result: UploadArtifactResponse, backend: string, payloadDigest: string): void {
    if (!result.id) throw new Error("GitHub did not return an artifact ID.");
    const url = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/artifacts/${result.id}`;
    core.setOutput("artifact-id", result.id);
    core.setOutput("artifact-url", url);
    core.setOutput("artifact-digest", result.digest ?? "");
    core.setOutput("payload-digest", payloadDigest);
    core.setOutput("storage-backend", backend);
    core.info(
      `Uploaded '${name}' via ${backend} in ${((Date.now() - started) / 1000).toFixed(1)}s; retention: ${days} days.`,
    );
  }
  if (!config) {
    core.info(
      mode === "github"
        ? "GitHub artifact storage explicitly selected; skipping external storage."
        : "No external bucket configured; using GitHub artifact storage.",
    );
    await nativeUpload();
    return;
  }
  const directory = await mkdtemp(path.join(tmpdir(), "s3-artifact-upload-"));
  const client = createStorage(config);
  try {
    const payload = archive ? path.join(directory, "payload.zip") : files[0]!;
    if (archive) await zipFiles(files, root, payload, compressionLevel);
    const size = (await stat(payload)).size;
    const sha256 = await digestFile(payload);
    const repositoryId = process.env.GITHUB_REPOSITORY_ID;
    const runId = process.env.GITHUB_RUN_ID;
    const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
    if (!repositoryId || !runId || !runAttempt)
      throw new Error("GitHub repository, run, and attempt context is required.");
    const server = new URL(process.env.GITHUB_SERVER_URL ?? "https://github.com").hostname;
    const key = `${config.prefix}/v1/ttl-${String(days).padStart(3, "0")}/${server}/${repositoryId}/${runId}/${runAttempt}/${randomUUID()}/payload`;
    try {
      await putPayload(client, config.bucket, key, payload, size);
    } catch (error) {
      if (!fallback) throw error;
      core.warning(
        `External upload failed (${error instanceof Error ? error.name : "Error"}); falling back to GitHub storage.`,
      );
      await nativeUpload();
      return;
    }
    const created = new Date();
    const manifest: Manifest = {
      kind: "s3-artifact",
      schemaVersion: 1,
      name,
      bucket: config.bucket,
      key,
      format: archive ? "zip" : "raw",
      filename: archive ? `${name}.zip` : name,
      size,
      sha256,
      repositoryId,
      runId,
      runAttempt,
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + days * DAY).toISOString(),
    };
    const file = path.join(directory, `${name}${SUFFIX}.manifest.json`);
    await writeFile(file, JSON.stringify(manifest, null, 2));
    // Publishing the pointer is the commit point. Never fallback after it may exist.
    let result: UploadArtifactResponse;
    try {
      result = await artifact.uploadArtifact(`${name}${SUFFIX}`, [file], directory, {
        retentionDays: days,
        compressionLevel: 0,
      });
    } catch (error) {
      // A timed-out finalize may have succeeded. Keep the payload in that case,
      // or when discovery itself fails; lifecycle will clean up any orphan.
      try {
        const { artifacts } = await artifact.listArtifacts();
        if (!artifacts.some((a) => a.name === `${name}${SUFFIX}`))
          await deletePayload(client, config.bucket, key);
      } catch {
        core.warning(
          "Could not confirm manifest publication; lifecycle will clean up any orphan payload.",
        );
      }
      throw error;
    }
    report(result, "s3", sha256);
    core.setOutput("manifest", JSON.stringify(manifest));
    core.info(`Payload size: ${size} bytes. GitHub stores the manifest only.`);
  } finally {
    client.destroy();
    await rm(directory, { recursive: true, force: true });
  }
}
