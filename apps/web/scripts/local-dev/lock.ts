import { execFile } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function acquireLocalLock(path: string) {
  if (existsSync(path)) {
    const pid = Number(readFileSync(path, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0)
      throw new Error(`Invalid launcher PID file: ${path}`);
    try {
      process.kill(pid, 0);
      const { stdout } = await exec(
        "ps",
        ["-p", String(pid), "-o", "command="],
        { timeout: 5000 },
      );
      if (stdout.includes("apps/web/scripts/local-dev.ts"))
        throw new Error(
          `Local development is already running (PID ${pid}). Stop it before starting another instance.`,
        );
      unlinkSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      unlinkSync(path);
    }
  }
  writeFileSync(path, String(process.pid), { flag: "wx", mode: 0o600 });
  return () => unlinkSync(path);
}
