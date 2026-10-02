import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { acquireLocalLock } from "./lock";

test("reclaims a stale lock when its PID belongs to an unrelated process", async () => {
  const directory = mkdtempSync(join(tmpdir(), "local-dev-lock-"));
  const path = join(directory, "launcher.pid");
  writeFileSync(path, String(process.pid));
  try {
    const unlock = await acquireLocalLock(path);
    expect(readFileSync(path, "utf8")).toBe(String(process.pid));
    unlock();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("refuses to replace a lock owned by an active launcher", async () => {
  const directory = mkdtempSync(join(tmpdir(), "local-dev-lock-"));
  const path = join(directory, "launcher.pid");
  const child = spawn(process.execPath, [
    "-e",
    "setInterval(()=>{},1000)",
    "apps/web/scripts/local-dev.ts",
  ]);
  await once(child, "spawn");
  writeFileSync(path, String(child.pid));
  try {
    await expect(acquireLocalLock(path)).rejects.toThrow("already running");
    expect(readFileSync(path, "utf8")).toBe(String(child.pid));
  } finally {
    child.kill();
    await once(child, "exit");
    rmSync(directory, { recursive: true, force: true });
  }
});
