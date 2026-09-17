import type { prepareLocalMailOfflineConversation } from "./local-mail-offline-plan";
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

export async function saveLocalMailOfflineConversation(
  plan: Awaited<ReturnType<typeof prepareLocalMailOfflineConversation>>,
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
        throw new Error(
          "The conversation changed. Prepare it again before saving offline.",
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
          throw new Error(
            "The conversation changed. Prepare it again before saving offline.",
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
        throw new Error(
          "The conversation changed. Prepare it again before saving offline.",
        );
      references.push(reference);
    }
  }
  signal?.throwIfAborted();
  if (!isEmailCacheEpochCurrent(emailAccountId, context.epoch))
    throw new Error(
      "The conversation changed. Prepare it again before saving offline.",
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
