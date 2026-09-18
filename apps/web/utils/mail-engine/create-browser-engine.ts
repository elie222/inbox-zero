import {
  createMailEngine,
  createHostRuntime,
  type MailEngine,
} from "@inboxzero/mail-core/engine";
import {
  createBackendMailboxSource,
  createBackendOperationExecutor,
} from "@inboxzero/mail-core/protocol/backend-adapter";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import { createMailHttpRequest } from "@/utils/mail-engine/http";
import { createWasmSqliteDriver } from "@/utils/mail-engine/wasm-sqlite";

export async function createBrowserMailEngine(input: {
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
  const engine = createMailEngine({
    store,
    source: createBackendMailboxSource({ request, accountId: input.accountId }),
    executor: createBackendOperationExecutor({
      request,
      accountId: input.accountId,
    }),
    runtime: createHostRuntime(),
    ownerId: "browser-owner",
  });
  await engine.requestSync([input.accountId]);
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        await engine.runUntil(Date.now() + 2000);
      } catch {
        await delay(1000);
      }
      await delay(250);
    }
  })();
  const originalClose = engine.close.bind(engine);
  return {
    ...engine,
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
