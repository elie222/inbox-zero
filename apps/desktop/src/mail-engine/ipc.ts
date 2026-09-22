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
    case "ensureConversation":
      return {
        status: "ok" as const,
        result: await engine.ensureConversation(request.payload),
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
    case "observeMailbox": {
      const handle = engine.observeMailbox(request.payload);
      const snapshot = await waitForLoadedSnapshot(handle);
      handle.close();
      return { status: "ok" as const, result: snapshot };
    }
    case "observeMailboxWindow": {
      const handle =
        engine.observeMailboxWindow?.(request.payload.query, {
          pageCount: request.payload.pageCount,
        }) ?? engine.observeMailbox(request.payload.query);
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
    case "observeOperation": {
      const handle = engine.observeOperation(request.payload);
      const snapshot = await waitForLoadedSnapshot(handle);
      handle.close();
      return { status: "ok" as const, result: snapshot };
    }
    case "observeAccounts": {
      const handle = engine.observeAccounts();
      const snapshot = await waitForLoadedSnapshot(handle);
      handle.close();
      return { status: "ok" as const, result: snapshot };
    }
    case "observeDrafts": {
      const handle = engine.observeDrafts(request.payload.accountIds);
      const snapshot = await waitForLoadedSnapshot(handle);
      handle.close();
      return { status: "ok" as const, result: snapshot };
    }
    case "observeOutbox": {
      const handle = engine.observeOutbox(request.payload.accountIds);
      const snapshot = await waitForLoadedSnapshot(handle);
      handle.close();
      return { status: "ok" as const, result: snapshot };
    }
    case "observeMailboxCatalog": {
      const handle = engine.observeMailboxCatalog(request.payload.accountId);
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
    case "referencedBlobIds":
      return {
        status: "ok" as const,
        result: await engine.referencedBlobIds(),
      };
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

function base64ToBytes(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}
