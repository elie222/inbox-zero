import { mailIpcRequestSchema } from "@inboxzero/mail-core/protocol/mail-ipc";
import type { MailEngine } from "@inboxzero/mail-core/engine";
import type { QueryHandle } from "@inboxzero/mail-core/queries";

export function parseMailIpcRequest(payload: unknown) {
  return mailIpcRequestSchema.safeParse(payload);
}

export async function dispatchMailIpc(engine: MailEngine, payload: unknown) {
  const parsed = parseMailIpcRequest(payload);
  if (!parsed.success) {
    return { status: "invalid" as const, issues: parsed.error.issues };
  }
  const request = parsed.data;
  switch (request.method) {
    case "submitMetadata":
      return {
        status: "ok" as const,
        result: await engine.submitMetadata(request.payload),
      };
    case "submitConversations":
      return {
        status: "ok" as const,
        result: await engine.submitConversations(request.payload),
      };
    case "saveDraft":
      return {
        status: "ok" as const,
        result: await engine.saveDraft(request.payload),
      };
    case "submitSend":
      return {
        status: "ok" as const,
        result: await engine.submitSend(request.payload),
      };
    case "cancelOperation":
      return {
        status: "ok" as const,
        result: await engine.cancelOperation(request.payload),
      };
    case "requestSync":
      return {
        status: "ok" as const,
        result: await engine.requestSync(request.payload.accountIds),
      };
    case "ensureMessageContent":
      return {
        status: "ok" as const,
        result: await engine.ensureMessageContent(request.payload),
      };
    case "getDiagnostics":
      return {
        status: "ok" as const,
        result: await engine.getDiagnostics(request.payload.accountId),
      };
    case "inspect":
      return {
        status: "ok" as const,
        result: await engine.inspect(),
      };
    case "observeMailbox": {
      const handle = engine.observeMailbox(request.payload);
      const snapshot = await waitForLoadedSnapshot(handle);
      handle.close();
      return { status: "ok" as const, result: snapshot };
    }
    case "observeConversation": {
      const handle = engine.observeConversation(request.payload.key, {
        after: request.payload.after,
        pageSize: request.payload.pageSize,
      });
      const snapshot = await waitForLoadedSnapshot(handle);
      handle.close();
      return { status: "ok" as const, result: snapshot };
    }
    case "cancel":
      return { status: "unsupported" as const };
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}

async function waitForLoadedSnapshot<T>(handle: QueryHandle<T>) {
  const current = handle.getSnapshot();
  if (current.status !== "loading") return current;
  return new Promise<ReturnType<QueryHandle<T>["getSnapshot"]>>((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(handle.getSnapshot());
    }, 2000);
    const unsubscribe = handle.subscribe(() => {
      const snapshot = handle.getSnapshot();
      if (snapshot.status === "loading") return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(snapshot);
    });
  });
}
