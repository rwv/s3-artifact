import * as core from "@actions/core";
import artifact from "@actions/artifact";
import type { FindOptions } from "@actions/artifact";
import { mkdtemp, rm, mkdir, readFile, copyFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SUFFIX,
  logicalName,
  selectArtifacts,
  parseManifest,
  parseHandoff,
  storageConfig,
  booleanInput,
  destinationPath,
  createStorage,
  getPayload,
  digestFile,
  extractZip,
  safeDestination,
  handleDigestMismatch,
  validateName,
} from "../../packages/core/src/index.ts";

export async function run(): Promise<void> {
  const input = core.getInput("manifest").trim();
  if (input && ["name", "artifact-ids", "pattern"].some((key) => core.getInput(key)))
    throw new Error("manifest is mutually exclusive with name, artifact-ids, and pattern.");
  const direct = input ? parseHandoff(JSON.parse(input)) : undefined;
  const name = core.getInput("name");
  if (name) validateName(name);
  const idInput = core.getInput("artifact-ids");
  const ids = idInput ? idInput.split(",").map((id) => Number(id.trim())) : undefined;
  if (ids?.some((id) => !Number.isSafeInteger(id) || id <= 0))
    throw new Error("artifact-ids must contain comma-separated positive integers.");
  const behavior = core.getInput("digest-mismatch") || "error";
  if (!["error", "warn", "info", "ignore"].includes(behavior))
    throw new Error("digest-mismatch must be error, warn, info, or ignore.");
  const options: FindOptions = {};
  const token = core.getInput("github-token");
  if (token) {
    const [repositoryOwner, repositoryName] = (
      core.getInput("repository") ||
      process.env.GITHUB_REPOSITORY ||
      ""
    ).split("/");
    const workflowRunId = Number(core.getInput("run-id") || process.env.GITHUB_RUN_ID);
    if (
      !repositoryOwner ||
      !repositoryName ||
      !Number.isSafeInteger(workflowRunId) ||
      workflowRunId <= 0
    )
      throw new Error("A valid repository and run-id are required.");
    options.findBy = { token, workflowRunId, repositoryName, repositoryOwner };
  }
  const selected = direct
    ? [
        {
          id: direct.kind === "github-artifact" ? direct.artifactId : 0,
          name: direct.kind === "github-artifact" ? direct.name : `${direct.name}${SUFFIX}`,
          digest: direct.kind === "github-artifact" ? direct.sha256 : undefined,
        },
      ]
    : selectArtifacts((await artifact.listArtifacts({ ...options, latest: false })).artifacts, {
        name,
        pattern: core.getInput("pattern"),
        ...(ids ? { ids } : {}),
      });
  const destination = destinationPath();
  await mkdir(destination, { recursive: true });
  const merge = booleanInput("merge-multiple", false);
  const skip = booleanInput("skip-decompress", false);
  const single = Boolean(direct) || Boolean(name) || ids?.length === 1;
  const config = direct?.kind === "github-artifact" ? undefined : storageConfig();
  const client = config ? createStorage(config) : undefined;
  const temporary = await mkdtemp(path.join(tmpdir(), "s3-artifact-download-"));
  try {
    // Stable order makes merge-multiple collisions deterministic: highest ID wins.
    for (const item of [...selected].sort((a, b) => a.id - b.id)) {
      const logical = logicalName(item.name);
      validateName(logical);
      const target = single || merge ? destination : await safeDestination(destination, logical);
      await mkdir(target, { recursive: true });
      const expectedHash = item.digest?.replace(/^sha256:/u, "");
      const hashOptions = expectedHash ? { expectedHash } : {};
      if (!item.name.endsWith(SUFFIX)) {
        const result = await artifact.downloadArtifact(item.id, {
          ...options,
          ...hashOptions,
          path: target,
          skipDecompress: skip,
        });
        handleDigestMismatch(result.digestMismatch ?? false, behavior, logical);
        continue;
      }
      const pointerDir = path.join(temporary, String(item.id));
      await mkdir(pointerDir, { recursive: true });
      let manifest;
      if (direct?.kind === "s3-artifact") {
        manifest = direct;
      } else {
        const result = await artifact.downloadArtifact(item.id, {
          ...options,
          ...hashOptions,
          path: pointerDir,
        });
        handleDigestMismatch(result.digestMismatch ?? false, behavior, `${logical} manifest`);
        manifest = parseManifest(
          JSON.parse(await readFile(path.join(pointerDir, `${item.name}.manifest.json`), "utf8")),
          logical,
        );
      }
      if (Date.now() >= Date.parse(manifest.expiresAt))
        throw new Error(`Artifact '${logical}' has expired.`);
      if (!client || !config)
        throw new Error(
          `Artifact '${logical}' is stored externally. Configure the storage endpoint, bucket, and credentials on this download job. No GitHub payload backup exists.`,
        );
      if (manifest.bucket !== config.bucket || !manifest.key.startsWith(`${config.prefix}/v1/`))
        throw new Error("Manifest storage location does not match the configured bucket/prefix.");
      const payload = path.join(pointerDir, "payload");
      await getPayload(client, manifest.bucket, manifest.key, payload);
      if ((await stat(payload)).size !== manifest.size)
        throw new Error(`Payload size mismatch for '${logical}'.`);
      handleDigestMismatch((await digestFile(payload)) !== manifest.sha256, behavior, logical);
      if (manifest.format === "zip" && !skip) await extractZip(payload, target);
      else await copyFile(payload, await safeDestination(target, manifest.filename));
      core.info(`Downloaded '${logical}' from external storage (${manifest.size} bytes).`);
    }
    core.setOutput("download-path", destination);
    core.info(`Downloaded ${selected.length} artifact(s).`);
  } finally {
    client?.destroy();
    await rm(temporary, { recursive: true, force: true });
  }
}
