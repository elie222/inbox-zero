import {
  createHostRuntime,
  createMailEngine,
  type MailEngine,
} from "@inboxzero/mail-core/engine";
import {
  createBackendMailboxSource,
  createBackendOperationExecutor,
} from "@inboxzero/mail-core/protocol/backend-adapter";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import { createMailHttpRequest } from "./http";
import { createWasmSqliteDriver } from "./wasm-sqlite";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

const handles = new Map<string, { close: () => void }>();
let engine: MailEngine | undefined;
let loop: Promise<void> | undefined;
let stopped = false;
let startedAccount: string | undefined;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  handle(event.data).catch((error) => {
    post({
      id: "worker",
      type: "error",
      message: error instanceof Error ? error.message : "worker_error",
    });
  });
};

async function handle(message: WorkerRequest) {
  try {
    if (message.type === "start") {
      if (engine) {
        if (startedAccount !== message.input.accountId) {
          post({
            id: message.id,
            type: "error",
            message: "account_mismatch",
          });
          return;
        }
        post({ id: message.id, type: "ok" });
        return;
      }
      engine = await createWorkerEngine(message.input);
      startedAccount = message.input.accountId;
      post({ id: message.id, type: "ok" });
      return;
    }
    if (!engine) {
      post({ id: message.id, type: "error", message: "engine not started" });
      return;
    }
    if (message.type === "close") {
      stopped = true;
      for (const handle of handles.values()) handle.close();
      handles.clear();
      await engine.close();
      engine = undefined;
      startedAccount = undefined;
      await loop;
      post({ id: message.id, type: "ok" });
      return;
    }
    if (message.type === "unobserve") {
      handles.get(message.handleId)?.close();
      handles.delete(message.handleId);
      post({ id: message.id, type: "ok" });
      return;
    }
    if (message.type === "observe") {
      const observed = observe(engine, message.kind, message.args);
      handles.set(message.handleId, observed);
      observed.subscribe(() => {
        post({
          type: "snapshot",
          handleId: message.handleId,
          snapshot: observed.getSnapshot(),
        });
      });
      post({
        type: "snapshot",
        handleId: message.handleId,
        snapshot: observed.getSnapshot(),
      });
      post({ id: message.id, type: "ok" });
      return;
    }
    const method = engine[message.method as keyof MailEngine];
    if (typeof method !== "function") {
      post({
        id: message.id,
        type: "error",
        message: `unsupported method ${message.method}`,
      });
      return;
    }
    const value = await (
      method as (...args: unknown[]) => Promise<unknown>
    ).apply(engine, message.args);
    post({ id: message.id, type: "ok", value });
  } catch (error) {
    post({
      id: "id" in message ? message.id : "worker",
      type: "error",
      message: error instanceof Error ? error.message : "worker_error",
    });
  }
}

function observe(
  client: MailEngine,
  kind: "mailbox" | "conversation" | "operation",
  args: unknown[],
) {
  if (kind === "mailbox") {
    return client.observeMailbox(args[0] as never);
  }
  if (kind === "conversation") {
    return client.observeConversation(args[0] as never, args[1] as never);
  }
  return client.observeOperation(args[0] as never);
}

async function createWorkerEngine(input: {
  accountId: string;
  provider: "google" | "microsoft";
  generation?: string;
  persist?: boolean;
}) {
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
    runtime: createHostRuntime(),
    ownerId: "browser-worker",
  });
  await created.requestSync([input.accountId]);
  stopped = false;
  loop = (async () => {
    while (!stopped) {
      try {
        await created.runUntil(Date.now() + 2000);
      } catch {
        await delay(1000);
      }
      await delay(250);
    }
  })();
  return created;
}

function post(message: WorkerResponse) {
  self.postMessage(message);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
