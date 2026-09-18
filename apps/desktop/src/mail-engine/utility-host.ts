import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DesktopMailOwner } from "./owner";

export function createChildDesktopMailOwner(input: {
  databasePath: string;
  origin: string;
  modulePath?: string;
}): Promise<DesktopMailOwner> {
  const modulePath =
    input.modulePath ??
    join(dirname(fileURLToPath(import.meta.url)), "utility-child.ts");
  const child = fork(modulePath, [], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });
  return attachChildOwner(child, input);
}

export async function attachChildOwner(
  child: ChildProcess,
  input: { databasePath: string; origin: string },
): Promise<DesktopMailOwner> {
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  child.on("message", (message: unknown) => {
    if (!message || typeof message !== "object" || !("id" in message)) return;
    const id = String(message.id);
    const waiter = pending.get(id);
    if (!waiter) return;
    pending.delete(id);
    if ("status" in message && message.status === "error") {
      waiter.reject(new Error("mail engine child failed"));
      return;
    }
    waiter.resolve("result" in message ? message.result : message);
  });
  child.on("exit", () => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error("mail engine child exited"));
    }
    pending.clear();
  });

  function call(payload: unknown) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.send({ id, ...((payload as object) ?? {}) });
    });
  }

  await call({
    type: "start",
    databasePath: input.databasePath,
    origin: input.origin,
  });

  return {
    handleIpc(payload) {
      return call({ type: "ipc", payload }) as Promise<unknown>;
    },
    async recover() {
      await call({ type: "recover" });
    },
    async close() {
      await call({ type: "close" });
      child.disconnect();
    },
  };
}
