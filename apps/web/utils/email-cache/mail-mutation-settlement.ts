import type { ParsedMessage } from "@/utils/types";
import { getEmailCacheDatabase } from "./database";
import { notifyMailboxStoreChange } from "./mailbox";
import {
  getMailMutationThreadKey,
  updateMessageReadState,
} from "./mail-mutation-overlay";
import type { MailMutation } from "./mail-mutations";

export async function settleMailMutationInCache(mutation: MailMutation) {
  await settleMailMutationBatchInCache([mutation]);
}

export async function settleMailMutationBatchInCache(
  mutations: MailMutation[],
) {
  const applicable = mutations.filter(isCacheSettlementMutation);
  if (!applicable.length) return;
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction(
    ["mailboxMessages", "threadRows", "threadViews"],
    "readwrite",
  );
  const mailboxMessages = transaction.objectStore("mailboxMessages");
  const settledAt = Date.now();

  if (applicable.some((mutation) => mutation.kind === "set_read_state")) {
    for (const mutation of applicable) {
      for (const messageId of new Set(mutation.messageIds)) {
        const key = [mutation.emailAccountId, messageId] as [string, string];
        if (mutation.kind !== "set_read_state") {
          await mailboxMessages.delete(key);
          continue;
        }
        const record = await mailboxMessages.get(key);
        if (record) {
          await mailboxMessages.put({
            ...record,
            data: updateMessageReadState(record.data, mutation.read),
            lastAccessedAt: settledAt,
          });
        }
      }
    }
  } else {
    const deleteKeys = new Map<string, [string, string]>();
    for (const mutation of applicable) {
      for (const messageId of mutation.messageIds) {
        deleteKeys.set(`${mutation.emailAccountId}\u0000${messageId}`, [
          mutation.emailAccountId,
          messageId,
        ]);
      }
    }
    await Promise.all(
      [...deleteKeys.values()].map((key) => mailboxMessages.delete(key)),
    );
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

  const removedRowKeys = new Set<string>();
  let cursor = await transaction.objectStore("threadRows").openCursor();
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
      if (updated === undefined) {
        removedRowKeys.add(
          getMailMutationThreadKey(row.emailAccountId, row.threadId),
        );
        await cursor.delete();
      } else if (updated !== row.data) {
        await cursor.update({
          ...row,
          data: updated,
          lastAccessedAt: settledAt,
        });
      }
    }
    cursor = await cursor.continue();
  }

  let viewCursor = await transaction.objectStore("threadViews").openCursor();
  while (viewCursor) {
    const view = viewCursor.value;
    const threadIds = view.threadIds.filter(
      (threadId) =>
        !removedRowKeys.has(
          getMailMutationThreadKey(view.emailAccountId, threadId),
        ),
    );
    if (threadIds.length !== view.threadIds.length) {
      await viewCursor.update({
        ...view,
        threadIds,
        lastAccessedAt: settledAt,
      });
    }
    viewCursor = await viewCursor.continue();
  }
  await transaction.done;
  for (const emailAccountId of new Set(
    applicable.map((mutation) => mutation.emailAccountId),
  )) {
    notifyMailboxStoreChange(emailAccountId);
  }
}

function isCacheSettlementMutation(mutation: MailMutation) {
  return (
    mutation.kind !== "unarchive" &&
    mutation.kind !== "untrash" &&
    mutation.kind !== "cancel_snooze" &&
    mutation.kind !== "reply"
  );
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
  if (!data || typeof data !== "object") return;
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.messages)) {
    const messages = updateMessages(record.messages, mutation);
    return messages.length ? { ...record, messages } : undefined;
  }
  const nested = record.thread;
  if (nested && typeof nested === "object") {
    const thread = nested as Record<string, unknown>;
    if (!Array.isArray(thread.messages)) return;
    const messages = updateMessages(thread.messages, mutation);
    return messages.length
      ? { ...record, thread: { ...thread, messages } }
      : undefined;
  }
  return;
}

function updateMessages(messages: unknown[], mutation: MailMutation) {
  const snapshot = new Set(mutation.messageIds);
  if (mutation.kind === "set_read_state") {
    return messages.map((message) =>
      isParsedMessage(message) && snapshot.has(message.id)
        ? updateMessageReadState(message, mutation.read)
        : message,
    );
  }
  return messages.filter(
    (message) => !isParsedMessage(message) || !snapshot.has(message.id),
  );
}

function isParsedMessage(value: unknown): value is ParsedMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string",
  );
}
