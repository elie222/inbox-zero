import {
  createHostRuntime,
  createMailEngine,
} from "@inboxzero/mail-core/engine";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import { createMailHttpRequest } from "./http";
import { createWasmSqliteDriver } from "./wasm-sqlite";
import {
  shouldReleaseDeferredOnStart,
  type BrowserEngineStart,
  type WorkerRequest,
} from "./worker-protocol";
import { createMemoryBlobStore } from "@inboxzero/mail-core/memory-blob-store";
import { browserStoragePressure } from "./storage-pressure";
import { createMailWorkerHost } from "./worker-session";
import type { BrowserMailEngine } from "./create-browser-engine";
import { createRoutedBackendAdapter } from "@inboxzero/mail-core/protocol/routed-backend-adapter";

const host = createMailWorkerHost({
  createEngine: createWorkerEngine,
  post: (message) => {
    self.postMessage(message);
  },
});

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  host.handle(event.data).catch((error) => {
    self.postMessage({
      id: "worker",
      type: "error",
      message: error instanceof Error ? error.message : "worker_error",
    });
  });
};

async function createWorkerEngine(
  input: BrowserEngineStart,
): Promise<BrowserMailEngine> {
  const driver = await createWasmSqliteDriver({ persist: input.persist });
  const runtime = createHostRuntime({
    storagePressure: browserStoragePressure,
  });
  const store = await createSqliteMailStore(driver, {
    maxPendingOperations: input.maxPendingOperations,
    runtime,
  });
  const ensureAccount: BrowserMailEngine["ensureAccount"] = async (account) => {
    await store.ensureAccount({
      accountId: account.accountId,
      provider: account.provider,
      generation: account.generation ?? account.accountId,
    });
  };
  await ensureAccount(input);
  const ports = createRoutedBackendAdapter({
    requestFor: createMailHttpRequest,
  });
  const created = createMailEngine({
    store,
    source: ports.source,
    executor: ports.executor,
    assistant: ports.assistant,
    runtime,
    blobStore: createMemoryBlobStore(),
    ownerId: "browser-worker",
  });
  if (shouldReleaseDeferredOnStart(input.online)) {
    await created.requestSync([input.accountId]);
  }
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        await created.runUntil(Date.now() + 2000);
      } catch {
        await delay(1000);
      }
      await delay(250);
    }
  })();
  const originalClose = created.close.bind(created);
  return {
    ...created,
    ensureAccount,
    async close() {
      stopped = true;
      await originalClose();
      await loop;
    },
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
