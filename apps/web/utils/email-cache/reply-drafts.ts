import { createPreservedEmailBlocks } from "@/utils/email/preserved-blocks";
import { notifyMailMutationChange } from "./mail-mutations";
import { decodedBase64Size, sendEmailBody } from "@/utils/types/mail";
import {
  prepareEmailDraft,
  type EmailComposerAttachment,
  type PreparedEmailDraft,
} from "@inboxzero/email-editor/core";
import type { EmailEditorPreservedBlock } from "@inboxzero/email-editor/web";
import type { SendEmailBody } from "@/utils/types/mail";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
  type StoredReplyDraft,
} from "./database";

export type ReplyDraftContent = {
  requestId?: string;
  deliveryPath?: "scheduled" | "outbox";
  values: Omit<SendEmailBody, "attachments" | "messageHtml">;
  draft: PreparedEmailDraft;
  preservedBlocks: EmailEditorPreservedBlock[];
  attachments: EmailComposerAttachment[];
  sendAt?: string;
  remindAt?: string;
};

export type ReplyDraftIdentity = Pick<
  StoredReplyDraft,
  "emailAccountId" | "threadId" | "messageId"
>;
type ReplyDraftScope = Pick<ReplyDraftIdentity, "emailAccountId" | "threadId">;
const listeners = new Set<(scope: ReplyDraftScope) => void>();
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("inbox-zero-reply-drafts")
    : null;
channel?.addEventListener("message", (event) => {
  const scope = event.data;
  if (
    typeof scope?.emailAccountId !== "string" ||
    typeof scope?.threadId !== "string"
  )
    return;
  for (const listener of listeners) listener(scope);
});

export function subscribeToReplyDrafts(
  listener: (scope: ReplyDraftScope) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getReplyDraft(identity: ReplyDraftIdentity) {
  const epoch = captureEmailCacheEpoch(identity.emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database)
    throw new Error("Draft storage is unavailable on this device.");
  const draft = await database.get("replyDrafts", [
    identity.emailAccountId,
    identity.threadId,
    identity.messageId,
  ]);
  if (!isEmailCacheEpochCurrent(identity.emailAccountId, epoch))
    throw new Error("This account’s local draft storage was cleared.");
  return draft;
}

export async function getReplyDrafts(emailAccountId: string, threadId: string) {
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database)
    throw new Error("Draft storage is unavailable on this device.");
  const drafts = await database.getAllFromIndex(
    "replyDrafts",
    "byAccountThread",
    [emailAccountId, threadId],
  );
  if (!isEmailCacheEpochCurrent(emailAccountId, epoch))
    throw new Error("This account’s local draft storage was cleared.");
  return drafts.filter((draft) => draft.content !== null);
}

export function createReplyDraftWriter(
  identity: ReplyDraftIdentity,
  initialRevision = 0,
) {
  let revision = initialRevision;
  let stopped = false;
  let pending: Promise<unknown> = Promise.resolve();
  const epoch = captureEmailCacheEpoch(identity.emailAccountId);
  const write = (content: ReplyDraftContent | null) => {
    const operation = pending
      .catch(() => {})
      .then(async () => {
        if (!isEmailCacheEpochCurrent(identity.emailAccountId, epoch))
          throw new Error("This account's local draft storage was cleared.");
        const database = await getEmailCacheDatabase();
        if (!database)
          throw new Error("Draft storage is unavailable on this device.");
        if (!isEmailCacheEpochCurrent(identity.emailAccountId, epoch))
          throw new Error("This account's local draft storage was cleared.");
        const transaction = database.transaction("replyDrafts", "readwrite");
        const key: [string, string, string] = [
          identity.emailAccountId,
          identity.threadId,
          identity.messageId,
        ];
        const previous = await transaction.store.get(key);
        if ((previous?.revision ?? 0) !== revision) {
          await transaction.done;
          throw new Error(
            "This draft changed in another tab. Reopen the reply to load that version.",
          );
        }
        await transaction.store.put({
          ...identity,
          content,
          revision: revision + 1,
          updatedAt: Date.now(),
        });
        await transaction.done;
        revision += 1;
        if (Boolean(previous?.content) !== Boolean(content)) {
          for (const listener of listeners) listener(identity);
          channel?.postMessage(identity);
        }
      });
    pending = operation;
    return operation;
  };
  return {
    save(content: ReplyDraftContent) {
      if (stopped)
        return Promise.reject(
          new Error("This draft is closed. Reopen the reply before editing."),
        );
      return write(content);
    },
    clear() {
      stopped = true;
      // Keep a revision tombstone so an older tab cannot resurrect a sent draft.
      return write(null);
    },
  };
}

export async function restoreReplyFromOutbox(
  id: string,
  emailAccountId: string,
) {
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database)
    throw new Error("Draft storage is unavailable on this device.");
  const row = await database.get("mailMutations", id);
  if (!isEmailCacheEpochCurrent(emailAccountId, epoch))
    throw new Error("This account’s local draft storage was cleared.");
  if (row?.kind !== "reply" || row.emailAccountId !== emailAccountId)
    throw new Error("Queued reply was not found.");
  const email = sendEmailBody.parse((row.payload as { email: unknown }).email);
  const draft = prepareEmailDraft({ html: email.messageHtml });
  const { attachments, messageHtml: _messageHtml, ...values } = email;
  const content: ReplyDraftContent = {
    values,
    draft,
    preservedBlocks: createPreservedEmailBlocks(draft),
    attachments: (attachments ?? []).map((file, index) => ({
      id: file.id ?? String(index),
      filename: file.filename,
      mimeType: file.contentType,
      contentBase64: file.content,
      size: file.size ?? decodedBase64Size(file.content),
      disposition: file.disposition ?? "attachment",
      contentId: file.contentId,
    })),
  };
  const identity = {
    emailAccountId: row.emailAccountId,
    threadId: row.threadId,
    messageId: row.messageIds[0],
  };
  if (!identity.messageId)
    throw new Error("The reply's original message is unavailable.");
  if (!isEmailCacheEpochCurrent(emailAccountId, epoch))
    throw new Error("This account’s local draft storage was cleared.");
  const transaction = database.transaction(
    ["mailMutations", "replyDrafts"],
    "readwrite",
  );
  const current = await transaction.objectStore("mailMutations").get(id);
  const key: [string, string, string] = [
    identity.emailAccountId,
    identity.threadId,
    identity.messageId,
  ];
  const previous = await transaction.objectStore("replyDrafts").get(key);
  if (
    !current ||
    current.updatedAt !== row.updatedAt ||
    current.leaseOwner ||
    !["pending", "retry_wait", "blocked_auth", "failed"].includes(
      current.status,
    ) ||
    previous?.content
  ) {
    await transaction.done;
    throw new Error(
      previous?.content
        ? "Finish or discard the current draft first."
        : "Sending has already started. This reply cannot be edited safely.",
    );
  }
  await transaction.objectStore("replyDrafts").put({
    ...identity,
    content,
    revision: (previous?.revision ?? 0) + 1,
    updatedAt: Date.now(),
  });
  await transaction.objectStore("mailMutations").delete(id);
  await transaction.done;
  for (const listener of listeners) listener(identity);
  channel?.postMessage(identity);
  notifyMailMutationChange();
}
