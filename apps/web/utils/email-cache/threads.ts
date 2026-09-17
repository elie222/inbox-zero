import {
  withOptionalMailCacheWrite,
  createAccountedMailTransaction,
} from "./optional-cache-write";
import {
  isLocalMailCacheContextCurrent,
  canPersistLocalMailSnapshot,
  type LocalMailCacheContext,
} from "./local-mail-cache-context";
import { getThreadDetailKeyRange } from "./keys";
import {
  deleteLocalMailMessages,
  storeLocalMailMessages,
} from "./local-mail-messages";
import { markSearchThreadsDirty } from "./search-index-work";
import { notifyEmailCacheChange } from "./cache-events";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { sanitizeCachedMailMessage } from "./message-content";
import { scheduleEmailCacheCleanup } from "./cleanup";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import {
  getThreadCacheVersion,
  canReadPersistedThread,
} from "./thread-invalidation";
import { EMAIL_CACHE_MAX_AGE_MS } from "./policy";

export type CachedThreadDetail = {
  byteSize: number;
  cachedAt: number;
  data: ThreadResponse;
};

export async function writeCachedThreadDetail({
  emailAccountId,
  threadId,
  variant,
  data,
  cacheContext,
  now = Date.now(),
  version = getThreadCacheVersion(emailAccountId, threadId),
}: {
  emailAccountId: string;
  threadId: string;
  variant: string;
  data: ThreadResponse;
  now?: number;
  version?: string;
  cacheContext?: LocalMailCacheContext;
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const sanitized = sanitizeThreadResponse(data);
  const byteSize = getThreadResponseByteSize(sanitized);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    return await withOptionalMailCacheWrite(
      database,
      [
        "threadDetails",
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
        if (
          !(await isLocalMailCacheContextCurrent(
            transaction,
            emailAccountId,
            cacheContext,
          )) ||
          !(await canPersistLocalMailSnapshot(
            transaction,
            emailAccountId,
            sanitized.thread.messages,
          ))
        ) {
          await transaction.done;
          return;
        }
        // Wait behind pending sync deletions before checking this response’s version.
        await transaction
          .objectStore("threadDetails")
          .getKey([emailAccountId, threadId, variant]);
        if (
          !isEmailCacheEpochCurrent(emailAccountId, epoch) ||
          version !== getThreadCacheVersion(emailAccountId, threadId)
        ) {
          await transaction.done;
          return;
        }
        await transaction.objectStore("threadDetails").put({
          emailAccountId,
          threadId,
          variant,
          data: sanitized,
          fetchedAt: now,
          lastAccessedAt: now,
          byteSize,
        });
        const options = /^drafts:([01])\|replies:([01])$/u.exec(variant);
        if (options) {
          const included = new Set(
            sanitized.thread.messages.map((message) => message.id),
          );
          let cursor = await transaction
            .objectStore("localMailMessages")
            .index("byAccountThreadMessage")
            .openCursor(getThreadDetailKeyRange(emailAccountId, threadId));
          while (cursor) {
            const record = cursor.value;
            if (
              !included.has(record.messageId) &&
              (options[1] === "1" ||
                !record.data.labelIds?.includes("DRAFT")) &&
              record.fetchedAt <= now
            ) {
              await deleteLocalMailMessages(
                transaction,
                emailAccountId,
                [record.messageId],
                now,
              );
            }
            cursor = await cursor.continue();
          }
        }
        await storeLocalMailMessages(
          transaction,
          emailAccountId,
          sanitized.thread.messages,
          now,
          {
            metadataOnly: options?.[2] !== "0",
            retention:
              cacheContext?.revision === undefined
                ? undefined
                : { revision: cacheContext.revision, purpose: "cache" },
          },
        );
        await markSearchThreadsDirty(transaction, emailAccountId, [threadId]);
        await transaction.done;
        notifyEmailCacheChange(emailAccountId);
        scheduleEmailCacheCleanup();
      },
    );
  } catch {
    scheduleEmailCacheCleanup({ force: true });
    // Cache writes are best-effort and must never affect thread rendering.
  }
}

export async function readCachedThreadDetail({
  emailAccountId,
  threadId,
  variant,
}: {
  emailAccountId: string;
  threadId: string;
  variant: string;
}): Promise<CachedThreadDetail | undefined> {
  if (!canReadPersistedThread(emailAccountId, threadId)) return;
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    const transaction = await createAccountedMailTransaction(
      database,
      "threadDetails",
    );
    const store = transaction.objectStore("threadDetails");
    const record = await store.get([emailAccountId, threadId, variant]);
    if (!record) {
      await transaction.done;
      return;
    }
    if (Date.now() - record.fetchedAt > EMAIL_CACHE_MAX_AGE_MS) {
      await transaction.done;
      scheduleEmailCacheCleanup();
      return;
    }

    const now = Date.now();
    const sanitized = sanitizeThreadResponse(record.data as ThreadResponse);
    const byteSize = getThreadResponseByteSize(sanitized);

    await store.put({
      ...record,
      data: sanitized,
      lastAccessedAt: now,
      byteSize,
    });
    await transaction.done;
    if (
      !isEmailCacheEpochCurrent(emailAccountId, epoch) ||
      !canReadPersistedThread(emailAccountId, threadId)
    )
      return;
    scheduleEmailCacheCleanup();
    return {
      data: sanitized,
      cachedAt: record.fetchedAt,
      byteSize,
    };
  } catch {
    return;
  }
}

function sanitizeThreadResponse(data: ThreadResponse): ThreadResponse {
  return {
    thread: {
      historyId: data.thread.historyId,
      id: data.thread.id,
      messages: data.thread.messages.map(sanitizeCachedMailMessage),
      snippet: data.thread.snippet,
    },
  };
}

function getThreadResponseByteSize(data: ThreadResponse) {
  return new Blob([JSON.stringify(data)]).size;
}
