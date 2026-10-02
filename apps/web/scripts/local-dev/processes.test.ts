import { expect, test } from "vitest";
import { createProcessManager } from "./processes";

test("fails readiness immediately when a managed service crashes", async () => {
  const manager = createProcessManager(process.cwd(), process.env);
  manager.start("crashing service", process.execPath, [
    "-e",
    "process.exit(7)",
  ]);
  try {
    await expect(
      manager.ready(
        "crashing service",
        async () => {
          throw new Error("not ready");
        },
        2000,
      ),
    ).rejects.toThrow("crashing service exited (7)");
    expect(manager.signal.aborted).toBe(true);
    expect(manager.signal.reason.message).toContain(
      "crashing service exited (7)",
    );
  } finally {
    await manager.stop();
  }
});

test("bounds a command that ignores termination", async () => {
  const manager = createProcessManager(process.cwd(), process.env);
  try {
    await expect(
      manager.run(
        "hanging command",
        process.execPath,
        ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"],
        100,
      ),
    ).rejects.toThrow("timed out");
  } finally {
    await manager.stop();
  }
}, 10_000);
