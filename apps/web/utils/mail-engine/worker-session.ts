import type { MailEngine } from "@inboxzero/mail-core/engine";
import {
  workerStartFence,
  type BrowserEngineStart,
  type WorkerRequest,
  type WorkerResponse,
} from "./worker-protocol";

export function createMailWorkerHost(hooks: {
  createEngine: (input: BrowserEngineStart) => Promise<MailEngine>;
  post: (message: WorkerResponse) => void;
}) {
  const handles = new Map<
    string,
    { close: () => void; loadMore?: () => Promise<void> }
  >();
  let engine: MailEngine | undefined;
  let startedAccount: string | undefined;
  let startQueue = Promise.resolve();

  async function handle(message: WorkerRequest) {
    try {
      if (message.type === "start") {
        const run = startQueue.then(() => start(message));
        startQueue = run.then(
          () => undefined,
          () => undefined,
        );
        await run;
        return;
      }
      if (!engine) {
        hooks.post({
          id: message.id,
          type: "error",
          message: "engine not started",
        });
        return;
      }
      if (message.type === "close") {
        for (const item of handles.values()) item.close();
        handles.clear();
        await engine.close();
        engine = undefined;
        startedAccount = undefined;
        hooks.post({ id: message.id, type: "ok" });
        return;
      }
      if (message.type === "loadMore") {
        const handle = handles.get(message.handleId);
        if (!handle?.loadMore) throw new Error("Mailbox window is unavailable");
        await handle.loadMore();
        hooks.post({ id: message.id, type: "ok" });
        return;
      }
      if (message.type === "unobserve") {
        handles.get(message.handleId)?.close();
        handles.delete(message.handleId);
        hooks.post({ id: message.id, type: "ok" });
        return;
      }
      if (message.type === "observe") {
        const observed = observe(engine, message.kind, message.args);
        handles.set(message.handleId, observed);
        observed.subscribe(() => {
          hooks.post({
            type: "snapshot",
            handleId: message.handleId,
            snapshot: observed.getSnapshot(),
          });
        });
        hooks.post({
          type: "snapshot",
          handleId: message.handleId,
          snapshot: observed.getSnapshot(),
        });
        hooks.post({ id: message.id, type: "ok" });
        return;
      }
      const method = engine[message.method as keyof MailEngine];
      if (typeof method !== "function") {
        hooks.post({
          id: message.id,
          type: "error",
          message: `unsupported method ${message.method}`,
        });
        return;
      }
      const args =
        message.method === "stageDraftAttachment"
          ? [stageDraftAttachmentArg(message.args[0])]
          : message.args;
      const value = await (
        method as (...args: unknown[]) => Promise<unknown>
      ).apply(engine, args);
      hooks.post({ id: message.id, type: "ok", value });
    } catch (error) {
      hooks.post({
        id: "id" in message ? message.id : "worker",
        type: "error",
        message: error instanceof Error ? error.message : "worker_error",
      });
    }
  }

  async function start(message: Extract<WorkerRequest, { type: "start" }>) {
    const fence = workerStartFence(startedAccount, message.input.accountId);
    if (fence) {
      hooks.post({
        id: message.id,
        type: "error",
        message: fence,
      });
      return;
    }
    if (engine) {
      hooks.post({ id: message.id, type: "ok" });
      return;
    }
    startedAccount = message.input.accountId;
    try {
      engine = await hooks.createEngine(message.input);
    } catch (error) {
      startedAccount = undefined;
      throw error;
    }
    hooks.post({ id: message.id, type: "ok" });
  }

  return { handle };
}

function observe(
  client: MailEngine,
  kind: "mailbox" | "mailboxWindow" | "conversation" | "operation",
  args: unknown[],
) {
  if (kind === "mailbox") {
    return client.observeMailbox(args[0] as never);
  }
  if (kind === "mailboxWindow") {
    return (
      client.observeMailboxWindow?.(args[0] as never) ??
      client.observeMailbox(args[0] as never)
    );
  }
  if (kind === "conversation") {
    return client.observeConversation(args[0] as never, args[1] as never);
  }
  return client.observeOperation(args[0] as never);
}

function stageDraftAttachmentArg(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const input = value as { bytes?: unknown };
  if (input.bytes instanceof Uint8Array) {
    const bytes = input.bytes;
    return {
      ...input,
      bytes: (async function* () {
        yield bytes;
      })(),
    };
  }
  return value;
}
