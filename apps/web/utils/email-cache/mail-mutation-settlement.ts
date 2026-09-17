import { createAccountedMailTransaction } from "./optional-cache-write";
import { storeLocalMailMessages } from "./local-mail-messages";
import { markSearchThreadsDirty } from "./search-index-work";
import type { ParsedMessage } from "@/utils/types";
import { getEmailCacheDatabase } from "./database";
import { notifyMailboxStoreChange } from "./mailbox";
import {
  applyMailMutationToMessage,
  getMailMutationThreadKey,
} from "./mail-mutation-overlay";
import type { MailMutation } from "./mail-mutations";

export async function settleMailMutationInCache(mutation: MailMutation) {
  await settleMailMutationBatchInCache([mutation]);
}

export async function settleMailMutationBatchInCache(
  mutations: MailMutation[],
) {
  const applicable = mutations.filter((mutation) => mutation.kind !== "reply");
  if (!applicable.length) return;
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = await createAccountedMailTransaction(database, [
    "mailboxMessages",
    "threadRows",
    "threadDetails",
    "searchIndexAccounts",
    "searchIndexWork",
    "localMailMessages",
    "localMailTombstones",
    "localMailRetentionPolicies",
    "localMailEvictedMessages",

    "localMailAttachmentFiles",
    "localMailAttachmentJobs",
    "localMailThreadProtection",
  ]);
  const mailboxMessages = transaction.objectStore("mailboxMessages");
  const settledAt = Date.now();

  for (const mutation of applicable) {
    const account = await transaction
      .objectStore("searchIndexAccounts")
      .get(mutation.emailAccountId);
    for (const messageId of new Set(mutation.messageIds)) {
      const key = [mutation.emailAccountId, messageId] as [string, string];
      const local = await transaction.objectStore("localMailMessages").get(key);
      if (local)
        await storeLocalMailMessages(
          transaction,
          mutation.emailAccountId,
          [applyMailMutationToMessage(local.data, mutation)],
          settledAt,
          {
            metadataOnly: true,
            retention:
              account?.retentionRevision === undefined
                ? undefined
                : { revision: account.retentionRevision, purpose: "current" },
          },
        );
      const record = await mailboxMessages.get(key);
      if (!record) continue;
      await mailboxMessages.put({
        ...record,
        data: applyMailMutationToMessage(record.data, mutation),
        lastAccessedAt: settledAt,
      });
    }
  }

  const mutationsByRawRow = new Map<string, MailMutation[]>();
  const mutationsByCompositeRow = new Map<string, MailMutation[]>();
  for (const mutation of applicable) {
    appendMutation(
      mutationsByRawRow,
      getMailMutationThreadKey(mutation.emailAccountId, mutation.threadId),
      mutation,
    );
    appendMutation(
      mutationsByCompositeRow,
      getMailMutationThreadKey(
        mutation.emailAccountId,
        `${mutation.emailAccountId}:${mutation.threadId}`,
      ),
      mutation,
    );
  }

  for (const storeName of ["threadRows", "threadDetails"] as const) {
    let cursor = await transaction.objectStore(storeName).openCursor();
    while (cursor) {
      const row = cursor.value;
      const matchingMutations = [
        ...(mutationsByRawRow.get(
          getMailMutationThreadKey(row.emailAccountId, row.threadId),
        ) ?? []),
        ...(mutationsByCompositeRow.get(
          getMailMutationThreadKey(row.emailAccountId, row.threadId),
        ) ?? []),
      ];
      if (matchingMutations.length) {
        const updated = matchingMutations.reduce<unknown>(
          (data, mutation) => updateRowData(data, mutation),
          row.data,
        );
        if (updated !== row.data) {
          await cursor.update({
            ...row,
            data: updated,
            lastAccessedAt: settledAt,
          });
        }
      }
      cursor = await cursor.continue();
    }
  }
  const dirtyThreads = new Map<string, Set<string>>();
  for (const mutation of applicable) {
    const threads =
      dirtyThreads.get(mutation.emailAccountId) ?? new Set<string>();
    threads.add(mutation.threadId);
    dirtyThreads.set(mutation.emailAccountId, threads);
  }
  await Promise.all(
    [...dirtyThreads].map(([emailAccountId, threadIds]) =>
      markSearchThreadsDirty(transaction, emailAccountId, threadIds),
    ),
  );
  await transaction.done;
  for (const emailAccountId of dirtyThreads.keys())
    notifyMailboxStoreChange(emailAccountId);
}

function appendMutation(
  mutations: Map<string, MailMutation[]>,
  key: string,
  mutation: MailMutation,
) {
  const existing = mutations.get(key) ?? [];
  existing.push(mutation);
  mutations.set(key, existing);
}

function updateRowData(data: unknown, mutation: MailMutation): unknown {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.messages)) {
    return {
      ...record,
      messages: updateMessages(record.messages, mutation),
    };
  }
  const nested = record.thread;
  if (nested && typeof nested === "object") {
    const thread = nested as Record<string, unknown>;
    if (!Array.isArray(thread.messages)) return data;
    return {
      ...record,
      thread: {
        ...thread,
        messages: updateMessages(thread.messages, mutation),
      },
    };
  }
  return data;
}

function updateMessages(messages: unknown[], mutation: MailMutation) {
  const snapshot = new Set(mutation.messageIds);
  return messages.map((message) => {
    if (!isParsedMessage(message) || !snapshot.has(message.id)) return message;
    return applyMailMutationToMessage(message, mutation);
  });
}

function isParsedMessage(value: unknown): value is ParsedMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string",
  );
}
