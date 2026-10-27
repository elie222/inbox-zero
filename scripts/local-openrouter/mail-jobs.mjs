import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export async function runMailJobsOnce({ secret, fetchImpl = fetch }) {
  if (!secret) throw new Error("Local scheduled mail requires CRON_SECRET");
  const response = await fetchImpl("http://127.0.0.1:3000/api/cron/scheduled-actions", {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Scheduled mail check returned HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  process.chdir(root);
  process.loadEnvFile(resolve(root, "apps/web/.env.local"));
  const path = resolve(root, ".context/mail-jobs-status.json");
  mkdirSync(dirname(path), { recursive: true });
  const status = { pid: process.pid, startedAt: new Date().toISOString(), updatedAt: "", phase: "starting", lastError: null, lastRunAt: null };
  let stopping = false;
  function heartbeat() {
    status.updatedAt = new Date().toISOString();
    writeFileSync(path + ".tmp", JSON.stringify(status));
    renameSync(path + ".tmp", path);
  }
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  heartbeat();
  const timer = setInterval(heartbeat, 30_000);
  try {
    while (!stopping) {
      try {
        await runMailJobsOnce({ secret: process.env.CRON_SECRET });
        status.phase = "running";
        status.lastError = null;
        status.lastRunAt = new Date().toISOString();
      } catch (error) {
        status.phase = "retrying";
        status.lastError = error.message;
      }
      heartbeat();
      if (!stopping) await delay(15_000);
    }
  } finally {
    clearInterval(timer);
    status.phase = "stopped";
    heartbeat();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
