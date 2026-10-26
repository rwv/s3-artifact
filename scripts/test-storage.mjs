import { execFileSync, spawnSync } from "node:child_process";
const image =
  "rustfs/rustfs@sha256:ed9210d6411d77ffceb70d94b964a3cb7d225983368bc25bebe01e995293dcc2";
const name = `s3-artifact-test-${process.pid}`;
let started = false;
try {
  execFileSync(
    "docker",
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      name,
      "--publish",
      "127.0.0.1::9000",
      "--env",
      "RUSTFS_CONSOLE_ENABLE=false",
      image,
    ],
    { stdio: "pipe" },
  );
  started = true;
  const mapping = execFileSync("docker", ["port", name, "9000/tcp"], { encoding: "utf8" }).trim();
  const endpoint = `http://${mapping}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!ready) throw new Error("Local RustFS did not start within 30 seconds.");
  const result = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", "--config", "vitest.storage.config.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        LOCAL_S3_ENDPOINT: endpoint,
        AWS_REGION: "us-east-1",
        AWS_ACCESS_KEY_ID: "rustfsadmin",
        AWS_SECRET_ACCESS_KEY: "rustfsadmin",
      },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (started) execFileSync("docker", ["stop", name], { stdio: "pipe" });
}
