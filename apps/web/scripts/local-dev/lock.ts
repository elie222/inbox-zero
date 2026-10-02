import { createHash } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";

export async function acquireLocalLock(path: string, appPort?: number) {
  // The kernel releases this checkout-specific lease after a crash. PID files
  // alone cannot safely arbitrate concurrent stale-lock recovery.
  const port =
    49_152 +
    (createHash("sha256").update(path).digest().readUInt32BE(0) % 16_384);
  if (port === appPort)
    throw new Error(
      `App port ${port} is reserved for this checkout's development lock. Choose another app port with --port.`,
    );
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE")
        reject(
          new Error(
            `Local development lock port ${port} is in use. Stop the other launcher or process before starting again.`,
          ),
        );
      else reject(error);
    });
    server.listen(port, "127.0.0.1", resolve);
  });
  try {
    writeFileSync(path, String(process.pid), { mode: 0o600 });
  } catch (error) {
    server.close();
    throw error;
  }
  return async () => {
    try {
      unlinkSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.warn(
          "[local] Could not remove informational launcher PID file",
          error,
        );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}
