import type { MailClient } from "@inboxzero/mail-core/engine";
import {
  OFFLINE_DISPATCH_HOLD_MS,
  type OperationState,
} from "@inboxzero/mail-core/operations";
import type { QueryHandle } from "@inboxzero/mail-core/queries";
import type { SendEmailBody } from "@/utils/types/mail";
import { sendEmailToDraftContent } from "@/utils/mail-engine/draft-content";
import {
  cancelSendAttachments,
  stageSendAttachments,
} from "@/utils/mail-engine/stage-attachments";
import { admissionRejectionCopy } from "@/utils/mail-engine/admission-notice";
import { getUndoSendHoldUntil } from "./undo-send";

export const READER_EMAIL_SETTLEMENT_TIMEOUT_MS = 15_000;

export type ReaderEmailOutcome =
  | { status: "sent"; messageId: string; threadId: string }
  | {
      status: "queued";
      reason: "offline" | "pending" | "blocked_auth";
      threadId: string;
      attachmentIds?: string[];
    }
  | {
      status: "held";
      holdUntil: number;
      mutationId: string;
      threadId: string;
      attachmentIds: string[];
    }
  | { status: "uncertain"; ownsNotification: boolean; threadId: string }
  | { status: "failed"; error: string; ownsNotification: boolean }
  | { status: "cancelled" };

export async function queueReaderEmail({
  client,
  email,
  emailAccountId,
  messageIds,
  online,
  onQueued,
  mutationId,
  holdForUndo,
  settlementTimeoutMs = READER_EMAIL_SETTLEMENT_TIMEOUT_MS,
  threadId,
}: {
  client: MailClient;
  email: SendEmailBody;
  emailAccountId: string;
  messageIds: string[];
  online: boolean;
  onQueued?: () => Promise<void>;
  mutationId?: string;
  holdForUndo?: boolean;
  settlementTimeoutMs?: number;
  threadId: string;
}): Promise<ReaderEmailOutcome> {
  const commandId = mutationId ?? crypto.randomUUID();
  const draftId = commandId;
  const attachmentIds = await stageSendAttachments(
    emailAccountId,
    email.attachments,
  );
  let queued = false;
  try {
    const content = sendEmailToDraftContent(email, attachmentIds);
    const draftRevision = await saveSendableDraft(client, {
      accountId: emailAccountId,
      draftId,
      content,
    });
    const nowMs = Date.now();
    const undoHoldUntil = holdForUndo
      ? getUndoSendHoldUntil(online, nowMs)
      : undefined;
    const admission = await client.submitSend({
      commandId,
      conversationId: threadId,
      draft: { accountId: emailAccountId, draftId },
      draftRevision,
      notBeforeMs: !online ? nowMs + OFFLINE_DISPATCH_HOLD_MS : undoHoldUntil,
      replyTo: messageIds[0]
        ? { accountId: emailAccountId, messageId: messageIds[0] }
        : null,
    });
    if (admission.status === "rejected") {
      throw new Error(
        admissionRejectionCopy(admission.code) ??
          (admission.code === "invalid"
            ? "This reply is already queued with different content. Check the thread delivery status."
            : "Could not queue this email. Try again."),
      );
    }
    queued = true;
    await onQueued?.();
    if (undoHoldUntil !== undefined) {
      return {
        status: "held",
        holdUntil: undoHoldUntil,
        mutationId: commandId,
        threadId,
        attachmentIds,
      };
    }
    if (!online) {
      return {
        status: "queued",
        reason: "offline",
        threadId,
        attachmentIds,
      };
    }

    return waitForSettlement({
      accountId: emailAccountId,
      client,
      operationId: commandId,
      settlementTimeoutMs,
      threadId,
    });
  } catch (error) {
    if (!queued) await cancelSendAttachments(emailAccountId, attachmentIds);
    throw error;
  }
}

export function waitForReaderEmailSettlement(options: {
  client: MailClient;
  accountId: string;
  mutationId: string;
  settlementTimeoutMs?: number;
  threadId: string;
}) {
  return waitForSettlement({
    accountId: options.accountId,
    client: options.client,
    operationId: options.mutationId,
    settlementTimeoutMs:
      options.settlementTimeoutMs ?? READER_EMAIL_SETTLEMENT_TIMEOUT_MS,
    threadId: options.threadId,
  });
}

async function saveSendableDraft(
  client: MailClient,
  input: {
    accountId: string;
    draftId: string;
    content: ReturnType<typeof sendEmailToDraftContent>;
  },
) {
  let expectedRevision: number | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const saved = await client.saveDraft({
      key: { accountId: input.accountId, draftId: input.draftId },
      expectedRevision,
      content: input.content,
    });
    if (saved.status === "saved") return saved.draftRevision;
    if (saved.status === "rejected") {
      throw new Error("Could not save this email on the device.");
    }
    if (saved.currentDraftRevision == null) {
      throw new Error("Could not save this email on the device.");
    }
    if (expectedRevision === saved.currentDraftRevision) {
      return saved.currentDraftRevision;
    }
    expectedRevision = saved.currentDraftRevision;
  }
  throw new Error("Could not save this email on the device.");
}

async function waitForSettlement({
  client,
  accountId,
  operationId,
  settlementTimeoutMs,
  threadId,
}: {
  client: MailClient;
  accountId: string;
  operationId: string;
  settlementTimeoutMs: number;
  threadId: string;
}): Promise<ReaderEmailOutcome> {
  const handle = client.observeOperation({
    accountId,
    operationId,
  });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: ReaderEmailOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      handle.close();
      resolve(outcome);
    };
    const inspect = () => {
      if (settled) return;
      const outcome = operationOutcome(handle, threadId);
      if (outcome) finish(outcome);
    };
    const unsubscribe = handle.subscribe(inspect);
    const timeout = setTimeout(
      () => finish({ status: "queued", reason: "pending", threadId }),
      settlementTimeoutMs,
    );
    inspect();
  });
}

function operationOutcome(
  handle: QueryHandle<OperationState>,
  threadId: string,
): ReaderEmailOutcome | undefined {
  const operation = handle.getSnapshot().data;
  if (!operation) return;
  if (operation.status === "succeeded") {
    return { status: "sent", messageId: "", threadId };
  }
  if (operation.status === "failed" || operation.status === "needs_attention") {
    return {
      status: "failed",
      error: operation.error?.code ?? "There was an error sending the email",
      ownsNotification: true,
    };
  }
  if (operation.status === "uncertain") {
    return { status: "uncertain", ownsNotification: true, threadId };
  }
  if (operation.status === "blocked_auth") {
    return { status: "queued", reason: "blocked_auth", threadId };
  }
  if (operation.status === "cancelled" || operation.status === "superseded") {
    return { status: "cancelled" };
  }
}
