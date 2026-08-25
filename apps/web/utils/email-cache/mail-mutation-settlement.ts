import type { ParsedMessage } from "@/utils/types";
import { getEmailCacheDatabase } from "./database";
import { updateMessageReadState } from "./mail-mutation-overlay";
import type { MailMutation } from "./mail-mutations";

export async function settleMailMutationInCache(mutation: MailMutation) {
  if (
    mutation.kind === "unarchive" ||
    mutation.kind === "untrash" ||
    mutation.kind === "cancel_snooze" ||
    mutation.kind === "reply"
  ) {
    return;
  }
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction(
    ["mailboxMessages", "threadRows", "threadViews"],
    "readwrite",
  );
  const messageIds = new Set(mutation.messageIds);

  if (mutation.kind === "set_read_state") {
    for (const messageId of messageIds) {
      const key = [mutation.emailAccountId, messageId] as [string, string];
      const record = await transaction.objectStore("mailboxMessages").get(key);
      if (record) {
        await transaction.objectStore("mailboxMessages").put({
          ...record,
          data: updateMessageReadState(record.data, mutation.read),
          lastAccessedAt: Date.now(),
        });
      }
    }
  } else {
    await Promise.all(
      [...messageIds].map((messageId) =>
        transaction
          .objectStore("mailboxMessages")
          .delete([mutation.emailAccountId, messageId]),
      ),
    );
  }

  const rawKey = mutation.threadId;
  const compositeKey = `${mutation.emailAccountId}:${mutation.threadId}`;
  const removedRowKeys = new Set<string>();
  let cursor = await transaction.objectStore("threadRows").openCursor();
  while (cursor) {
    const row = cursor.value;
    const isRawOwnerRow =
      row.emailAccountId === mutation.emailAccountId && row.threadId === rawKey;
    if (isRawOwnerRow || row.threadId === compositeKey) {
      const updated = updateRowData(row.data, mutation);
      if (updated === undefined) {
        removedRowKeys.add(`${row.emailAccountId}\u0000${row.threadId}`);
        await cursor.delete();
      } else if (updated !== row.data) {
        await cursor.update({
          ...row,
          data: updated,
          lastAccessedAt: Date.now(),
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
        !removedRowKeys.has(`${view.emailAccountId}\u0000${threadId}`),
    );
    if (threadIds.length !== view.threadIds.length) {
      await viewCursor.update({
        ...view,
        threadIds,
        lastAccessedAt: Date.now(),
      });
    }
    viewCursor = await viewCursor.continue();
  }
  await transaction.done;
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
