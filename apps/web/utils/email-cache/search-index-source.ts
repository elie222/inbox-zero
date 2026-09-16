import { getEmailCacheDatabase } from "./database";
import type { SearchMessage } from "./search-query";

export async function readSearchIndexThreadPage({
  emailAccountId,
  generation,
  threadId,
  token,
  afterMessageId,
}: {
  emailAccountId: string;
  generation: string;
  threadId: string;
  token: string;
  afterMessageId?: string;
}) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction(
    ["searchIndexAccounts", "searchIndexWork", "localMailMessages"],
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
  const range = IDBKeyRange.bound(
    [emailAccountId, threadId, afterMessageId ?? ""],
    [emailAccountId, threadId, []],
    afterMessageId !== undefined,
  );
  let cursor = await transaction
    .objectStore("localMailMessages")
    .index("byAccountThreadMessage")
    .openCursor(range);
  const messages: SearchMessage[] = [];
  let bytes = 0;
  while (cursor && messages.length < 100) {
    // This is a page target: return one large record so the consumer can
    // process or reject it explicitly without stalling the source cursor.
    if (messages.length && bytes + cursor.value.byteSize > 1_048_576) break;
    const message = cursor.value.data;
    messages.push({
      id: message.id,
      threadId: message.threadId,
      headers: message.headers,
      subject: message.subject,
      snippet: message.snippet,
      internalDate: message.internalDate,
      labelIds: message.labelIds,
      textPlain: message.textPlain,
      date: message.date,
      parentFolderId: message.parentFolderId,
    });
    bytes += cursor.value.byteSize;
    cursor = await cursor.continue();
  }
  await transaction.done;
  return { messages, nextMessageId: cursor ? messages.at(-1)?.id : undefined };
}
