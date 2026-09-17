import {
  LocalMailOfflineConversationChangedError,
  prepareLocalMailOfflineConversation,
} from "./local-mail-offline-plan";
import { getEmailCacheDatabase, isEmailCacheEpochCurrent } from "./database";
import { isLocalMailCacheContextCurrent } from "./local-mail-cache-context";
import { getThreadCacheVersion } from "./thread-invalidation";
import { withOptionalMailCacheWrite } from "./optional-cache-write";
import { storeLocalMailMessages } from "./local-mail-messages";
import {
  createLocalMailOfflineSnapshot,
  getLocalMailAttachmentReference,
} from "./local-mail-attachments";
import { notifyEmailCacheChange } from "./cache-events";

const SAVE_ATTEMPTS = 3;

type Plan = Awaited<ReturnType<typeof prepareLocalMailOfflineConversation>>;

/**
 * Saves a quoted conversation, re-quoting it if it moved in the meantime.
 *
 * Ordinary background synchronization re-reads a thread body at any moment,
 * which invalidates a quote that is only milliseconds old. A reader who asked
 * to keep the conversation wants the current version of it, so this saves that
 * instead of reporting a conflict it could resolve itself.
 */
export async function keepLocalMailConversationOffline(
  plan: Plan,
  signal?: AbortSignal,
) {
  let current = plan;
  for (let attempt = 0; ; attempt++) {
    try {
      return await saveLocalMailOfflineConversation(current, signal);
    } catch (caught) {
      if (
        attempt >= SAVE_ATTEMPTS - 1 ||
        !(caught instanceof LocalMailOfflineConversationChangedError)
      )
        throw caught;
      current = await prepareLocalMailOfflineConversation({
        emailAccountId: plan.emailAccountId,
        threadId: plan.threadId,
        signal,
      });
    }
  }
}

export async function saveLocalMailOfflineConversation(
  plan: Plan,
  signal?: AbortSignal,
) {
  const { emailAccountId, threadId, context, version, fetchedAt, data } = plan;
  signal?.throwIfAborted();
  const database = await getEmailCacheDatabase();
  if (!database) throw new Error("Local storage is unavailable.");
  const stored = await withOptionalMailCacheWrite(
    database,
    [
      "searchIndexAccounts",
      "searchIndexWork",
      "mailboxMessages",
      "localMailMessages",
      "localMailTombstones",
      "localMailRetentionPolicies",
      "localMailEvictedMessages",
      "localMailAttachmentFiles",
      "localMailAttachmentJobs",
      "localMailThreadProtection",
    ],
    async (transaction) => {
      signal?.throwIfAborted();
      if (
        !(await isLocalMailCacheContextCurrent(
          transaction,
          emailAccountId,
          context,
        )) ||
        version !== getThreadCacheVersion(emailAccountId, threadId)
      )
        throw new LocalMailOfflineConversationChangedError(
          "The conversation changed while it was being saved.",
        );
      await storeLocalMailMessages(
        transaction,
        emailAccountId,
        data.thread.messages,
        fetchedAt,
        {
          retention:
            context.revision === undefined
              ? undefined
              : { revision: context.revision, purpose: "restore" },
        },
      );
      for (const message of data.thread.messages) {
        const row = await transaction
          .objectStore("localMailMessages")
          .get([emailAccountId, message.id]);
        if (row?.bodyFetchedAt !== fetchedAt || row.threadId !== threadId)
          throw new LocalMailOfflineConversationChangedError(
            "The conversation changed while it was being saved.",
          );
      }
      signal?.throwIfAborted();
      return true;
    },
    "backfill",
  );
  if (!stored)
    throw new Error(
      "There is not enough available storage. Free space or increase the mail storage limit.",
    );
  notifyEmailCacheChange(emailAccountId);
  const references = [];
  for (const message of data.thread.messages) {
    for (const attachment of [
      ...(message.attachments ?? []),
      ...(message.inline ?? []),
    ]) {
      signal?.throwIfAborted();
      const reference = await getLocalMailAttachmentReference({
        emailAccountId,
        messageId: message.id,
        attachmentId: attachment.attachmentId,
      });
      if (!reference)
        throw new LocalMailOfflineConversationChangedError(
          "The conversation changed while it was being saved.",
        );
      references.push(reference);
    }
  }
  signal?.throwIfAborted();
  if (!isEmailCacheEpochCurrent(emailAccountId, context.epoch))
    throw new LocalMailOfflineConversationChangedError(
      "The conversation changed while it was being saved.",
    );
  const snapshotId = await createLocalMailOfflineSnapshot({
    emailAccountId,
    threadId,
    references,
    signal,
    messageIds: data.thread.messages.map((message) => message.id),
  });
  if (!snapshotId)
    throw new Error(
      "The offline download could not be reserved. Check available storage and try again.",
    );
  notifyEmailCacheChange(emailAccountId);
  return snapshotId;
}
