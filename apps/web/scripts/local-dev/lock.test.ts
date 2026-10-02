import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { acquireLocalLock } from "./lock";

test("recovers from a malformed PID file without manual deletion", async () => {
  const directory = mkdtempSync(join(tmpdir(), "local-dev-lock-"));
  const path = join(directory, "launcher.pid");
  writeFileSync(path, "not a PID");
  try {
    const unlock = await acquireLocalLock(path);
    expect(readFileSync(path, "utf8")).toBe(String(process.pid));
    await unlock();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("only one concurrent launcher acquires a stale lock", async () => {
  const directory = mkdtempSync(join(tmpdir(), "local-dev-lock-"));
  const path = join(directory, "launcher.pid");
  writeFileSync(path, String(process.pid));
  const results = await Promise.allSettled([
    acquireLocalLock(path),
    acquireLocalLock(path),
  ]);
  try {
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection?.reason.message).toContain("lock port");
  } finally {
    for (const result of results) {
      if (result.status === "fulfilled") {
        try {
          await result.value();
        } catch {}
      }
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test("releases the lock so the next launcher can start", async () => {
  const directory = mkdtempSync(join(tmpdir(), "local-dev-lock-"));
  const path = join(directory, "launcher.pid");
  try {
    const unlock = await acquireLocalLock(path);
    await unlock();
    const nextUnlock = await acquireLocalLock(path);
    await nextUnlock();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
