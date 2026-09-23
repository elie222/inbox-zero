import {
  mailIpcRequestSchema,
  type MailIpcRequest,
} from "@inboxzero/mail-core/protocol/mail-ipc";
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
    case "readDraft":
      return {
        status: "ok" as const,
        result: await engine.readDraft(request.payload),
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
    case "purgeAccount":
      return {
        status: "ok" as const,
        result: await engine.purgeAccount(request.payload.accountId),
      };
    case "inspect":
      return {
        status: "ok" as const,
        result: await engine.inspect(),
      };
    case "observeMailbox":
    case "observeMailboxWindow":
    case "observeConversation":
    case "observeOperation": {
      const handle = openMailIpcObservation(engine, request);
      const snapshot = await waitForLoadedSnapshot(handle);
      handle.close();
      return { status: "ok" as const, result: snapshot };
    }
    case "stageDraftAttachment": {
      const bytes = base64ToBytes(request.payload.contentBase64);
      return {
        status: "ok" as const,
        result: await engine.stageDraftAttachment({
          accountId: request.payload.accountId,
          draftId: request.payload.draftId,
          attachmentId: request.payload.attachmentId,
          filename: request.payload.filename,
          contentType: request.payload.contentType,
          checksum: request.payload.checksum,
          sizeBytes: request.payload.sizeBytes,
          inline: request.payload.inline,
          bytes: (async function* () {
            yield bytes;
          })(),
        }),
      };
    }
    case "cancel":
      return { status: "unsupported" as const };
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}

type ObservationRequest = Extract<
  MailIpcRequest,
  {
    method:
      | "observeMailbox"
      | "observeMailboxWindow"
      | "observeConversation"
      | "observeOperation";
  }
>;

export function isObservationRequest(
  request: MailIpcRequest,
): request is ObservationRequest {
  return (
    request.method === "observeMailbox" ||
    request.method === "observeMailboxWindow" ||
    request.method === "observeConversation" ||
    request.method === "observeOperation"
  );
}

export function openMailIpcObservation(
  engine: MailEngine,
  request: ObservationRequest,
): QueryHandle<unknown> {
  switch (request.method) {
    case "observeMailbox":
      return engine.observeMailbox(request.payload);
    case "observeMailboxWindow":
      return (
        engine.observeMailboxWindow?.(request.payload.query, {
          pageCount: request.payload.pageCount,
        }) ?? engine.observeMailbox(request.payload.query)
      );
    case "observeConversation":
      return engine.observeConversation(request.payload.key, {
        after: request.payload.after,
        pageSize: request.payload.pageSize,
      });
    case "observeOperation":
      return engine.observeOperation(request.payload);
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

function base64ToBytes(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}
