import { fork as nodeFork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DesktopMailOwner } from "./owner";

export type MailChildProcess = {
  send?(message: unknown): boolean;
  postMessage?(message: unknown): void;
  on(event: "message" | "exit", listener: (...args: never[]) => void): unknown;
  disconnect?(): void;
  kill?(): void;
};

export function createChildDesktopMailOwner(input: {
  databasePath: string;
  origin: string;
  modulePath?: string;
  fork?: (modulePath: string) => MailChildProcess;
}): Promise<DesktopMailOwner> {
  const modulePath =
    input.modulePath ??
    join(dirname(fileURLToPath(import.meta.url)), "utility-child.ts");
  const child = (input.fork ?? defaultNodeFork)(modulePath);
  return attachChildOwner(child, input);
}

export async function attachChildOwner(
  child: MailChildProcess,
  input: { databasePath: string; origin: string },
): Promise<DesktopMailOwner> {
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  child.on("message", ((raw: unknown) => {
    const message = unwrapChildMessage(raw);
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
  }) as (...args: never[]) => void);
  child.on("exit", (() => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error("mail engine child exited"));
    }
    pending.clear();
  }) as (...args: never[]) => void);

  function call(payload: unknown) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      sendChildMessage(child, { id, ...((payload as object) ?? {}) });
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
      child.disconnect?.();
      child.kill?.();
    },
  };
}

function sendChildMessage(child: MailChildProcess, message: unknown) {
  if (typeof child.send === "function") {
    child.send(message);
    return;
  }
  child.postMessage?.(message);
}

function unwrapChildMessage(message: unknown) {
  if (
    message &&
    typeof message === "object" &&
    "data" in message &&
    !("id" in message)
  ) {
    return message.data;
  }
  return message;
}

function defaultNodeFork(modulePath: string) {
  return nodeFork(modulePath, [], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });
}
