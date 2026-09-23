import {
  createMailEngine,
  createHostRuntime,
  type MailEngine,
} from "@inboxzero/mail-core/engine";
import type { AssistantStateSource } from "@inboxzero/mail-core/ports/assistant-source";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";
import { dispatchMailIpc, parseMailIpcRequest } from "./ipc";
import { createDesktopMailStore, nodeMailCrypto } from "./sqlite";
import { desktopStoragePressure } from "./storage-pressure";
import { createFileBlobStore } from "@inboxzero/mail-sqlite/blob-store";

export type DesktopMailOwner = {
  handleIpc(payload: unknown): Promise<unknown>;
  recover(): Promise<void>;
  close(): Promise<void>;
};

export async function createDesktopMailOwner(input: {
  databasePath: string;
  source: MailboxSource;
  executor: OperationExecutor;
  assistant?: AssistantStateSource;
}): Promise<DesktopMailOwner> {
  let owned = await createOwnedEngine(input);
  return {
    handleIpc(payload) {
      return handleOwnerIpc(owned, payload);
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
  assistant?: AssistantStateSource;
}): Promise<{
  engine: MailEngine;
  store: Awaited<ReturnType<typeof createDesktopMailStore>>;
  stop(): Promise<void>;
}> {
  const store = await createDesktopMailStore(input.databasePath);
  const engine = createMailEngine({
    store,
    source: input.source,
    executor: input.executor,
    assistant: input.assistant,
    runtime: createHostRuntime({
      ...nodeMailCrypto(),
      storagePressure: () => desktopStoragePressure(input.databasePath),
    }),
    blobStore: createFileBlobStore(`${input.databasePath}.blobs`),
    ownerId: "desktop-owner",
  });
  const abort = new AbortController();
  const loop = pumpEngine(engine, abort.signal);
  return {
    engine,
    store,
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

async function handleOwnerIpc(
  owned: Awaited<ReturnType<typeof createOwnedEngine>>,
  payload: unknown,
) {
  const parsed = parseMailIpcRequest(payload);
  if (parsed.success && parsed.data.method === "requestSync") {
    const provider = parsed.data.payload.provider ?? "google";
    for (const accountId of parsed.data.payload.accountIds) {
      await owned.store.ensureAccount({
        accountId,
        provider,
        generation: accountId,
      });
    }
  }
  return dispatchMailIpc(owned.engine, payload);
}
