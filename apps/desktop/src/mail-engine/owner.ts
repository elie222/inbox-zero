import {
  createMailEngine,
  createHostRuntime,
  type MailEngine,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";
import { dispatchMailIpc } from "./ipc";
import { createDesktopMailStore } from "./sqlite";

export type DesktopMailOwner = {
  handleIpc(payload: unknown): Promise<unknown>;
  recover(): Promise<void>;
  close(): Promise<void>;
};

export async function createDesktopMailOwner(input: {
  databasePath: string;
  source: MailboxSource;
  executor: OperationExecutor;
}): Promise<DesktopMailOwner> {
  let owned = await createOwnedEngine(input);
  return {
    handleIpc(payload) {
      return dispatchMailIpc(owned.engine, payload);
    },
    async recover() {
      await owned.stop();
      owned = await createOwnedEngine(input);
    },
    close() {
      return owned.stop();
    },
  };
}

async function createOwnedEngine(input: {
  databasePath: string;
  source: MailboxSource;
  executor: OperationExecutor;
}): Promise<{ engine: MailEngine; stop(): Promise<void> }> {
  const store = await createDesktopMailStore(input.databasePath);
  const engine = createMailEngine({
    store,
    source: input.source,
    executor: input.executor,
    runtime: createHostRuntime(),
    ownerId: "desktop-owner",
  });
  const abort = new AbortController();
  const loop = pumpEngine(engine, abort.signal);
  return {
    engine,
    async stop() {
      abort.abort();
      await loop;
      await engine.close();
    },
  };
}

async function pumpEngine(engine: MailEngine, signal: AbortSignal) {
  while (!signal.aborted) {
    try {
      await engine.runUntil(Date.now() + 2000, signal);
    } catch {
      if (signal.aborted) return;
    }
    await delay(250, signal);
  }
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
