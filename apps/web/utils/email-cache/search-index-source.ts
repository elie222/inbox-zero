import { createSearchMessageAccumulator } from "./search-message-merge";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import type { ThreadListItem } from "@/utils/threads/load";
import { getEmailCacheDatabase } from "./database";
import { getThreadDetailKeyRange } from "./keys";
import {
  EMAIL_CACHE_MAILBOX_MAX_AGE_MS,
  EMAIL_CACHE_MAX_AGE_MS,
} from "./policy";

export async function readSearchIndexThread({
  emailAccountId,
  generation,
  threadId,
  token,
  now = Date.now(),
}: {
  emailAccountId: string;
  generation: string;
  threadId: string;
  token: string;
  now?: number;
}) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction(
    [
      "searchIndexAccounts",
      "searchIndexWork",
      "mailboxMessages",
      "threadRows",
      "threadDetails",
    ],
    "readonly",
  );
  const [account, work] = await Promise.all([
    transaction.objectStore("searchIndexAccounts").get(emailAccountId),
    transaction.objectStore("searchIndexWork").get([emailAccountId, threadId]),
  ]);
  if (account?.generation !== generation || work?.token !== token) {
    await transaction.done;
    return;
  }
  const [mailbox, row, details] = await Promise.all([
    transaction
      .objectStore("mailboxMessages")
      .index("byAccountThread")
      .getAll([emailAccountId, threadId]),
    transaction.objectStore("threadRows").get([emailAccountId, threadId]),
    transaction
      .objectStore("threadDetails")
      .getAll(getThreadDetailKeyRange(emailAccountId, threadId)),
  ]);
  await transaction.done;
  const messages = createSearchMessageAccumulator();
  for (const detail of details) {
    if (now - detail.fetchedAt > EMAIL_CACHE_MAX_AGE_MS) continue;
    for (const message of (detail.data as ThreadResponse).thread.messages)
      if (message.threadId === threadId)
        messages.add(message, detail.fetchedAt);
  }
  if (row && now - row.fetchedAt <= EMAIL_CACHE_MAX_AGE_MS) {
    const thread = row.data as Partial<ThreadListItem>;
    if (Array.isArray(thread.messages)) {
      for (const message of thread.messages)
        if (message.threadId === threadId) messages.add(message, row.fetchedAt);
    }
  }
  for (const record of mailbox) {
    if (now - record.lastAccessedAt > EMAIL_CACHE_MAILBOX_MAX_AGE_MS) continue;
    messages.add(record.data, record.lastAccessedAt);
  }
  return messages.messages().sort((a, b) => a.id.localeCompare(b.id));
}
