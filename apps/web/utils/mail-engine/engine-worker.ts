import {
  createHostRuntime,
  createMailEngine,
  type MailEngine,
} from "@inboxzero/mail-core/engine";
import {
  createBackendAssistantSource,
  createBackendMailboxSource,
  createBackendOperationExecutor,
} from "@inboxzero/mail-core/protocol/backend-adapter";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import { createMailHttpRequest } from "./http";
import { createWasmSqliteDriver } from "./wasm-sqlite";
import type { WorkerRequest } from "./worker-protocol";
import { createMailWorkerHost } from "./worker-session";

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

async function createWorkerEngine(input: {
  accountId: string;
  provider: "google" | "microsoft";
  generation?: string;
  persist?: boolean;
}): Promise<MailEngine> {
  const request = createMailHttpRequest(input.accountId);
  const driver = await createWasmSqliteDriver({ persist: input.persist });
  const store = await createSqliteMailStore(driver);
  await store.ensureAccount({
    accountId: input.accountId,
    provider: input.provider,
    generation: input.generation ?? input.accountId,
  });
  const created = createMailEngine({
    store,
    source: createBackendMailboxSource({
      request,
      accountId: input.accountId,
    }),
    executor: createBackendOperationExecutor({
      request,
      accountId: input.accountId,
    }),
    assistant: createBackendAssistantSource({
      request,
      accountId: input.accountId,
    }),
    runtime: createHostRuntime(),
    ownerId: "browser-worker",
  });
  await created.requestSync([input.accountId]);
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
