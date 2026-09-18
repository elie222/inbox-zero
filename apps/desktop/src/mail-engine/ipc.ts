import { mailIpcRequestSchema } from "@inboxzero/mail-core/protocol/mail-ipc";
import type { MailEngine } from "@inboxzero/mail-core/engine";

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
    case "observeMailbox":
    case "observeConversation":
    case "cancel":
      return { status: "unsupported" as const };
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}
