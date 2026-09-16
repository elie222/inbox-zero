import {
  getEmailCacheDatabase,
  captureEmailCacheEpoch,
  isEmailCacheEpochCurrent,
} from "./database";
import type { createSearchIndexClient } from "./search-index-client";
import type { LocalSearchRequest, LocalSearchResult } from "./search";
import {
  parseLocalSearch,
  matchesLocalSearch,
  type SearchMessage,
} from "./search-query";
import { applyMailMutationToMessage } from "./mail-mutation-overlay";
import { isMailSyncActivated } from "./mail-activation";

export async function querySearchIndex(
  client: Pick<ReturnType<typeof createSearchIndexClient>, "request">,
  request: LocalSearchRequest,
): Promise<LocalSearchResult | undefined> {
  const parsed = request.accounts.map((account) =>
    parseLocalSearch(request.query, account.labels),
  );
  if (!request.accounts.length || parsed.some((query) => !query))
    return { status: "unsupported", threads: [] };
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const results: LocalSearchResult["threads"] = [];
  let indexing = false;
  const cursors: Record<string, string | null> = {};
  for (const [position, account] of request.accounts.entries()) {
    if (request.cursors?.[account.id] === null) {
      cursors[account.id] = null;
      continue;
    }
    if (!isMailSyncActivated(account.id)) return;
    const epoch = captureEmailCacheEpoch(account.id);
    const source = await database.get("searchIndexAccounts", account.id);
    if (!source || source.seed) return;
    const response = await client.request(
      { emailAccountId: account.id, generation: source.generation },
      {
        command: "search",
        request: {
          emailAccountId: account.id,
          generation: source.generation,
          query: request.query,
          labels: account.labels,
          limit: 100,
          beforeRowId: request.cursors?.[account.id] ?? undefined,
        },
      },
    );
    if (
      !("result" in response) ||
      !response.result ||
      typeof response.result !== "object" ||
      !("messages" in response.result)
    )
      return;
    const page = response.result;
    if (page.status !== "ready") return;
    indexing ||= !!page.pendingReplacements;
    cursors[account.id] = page.nextCursor ?? null;
    const transaction = database.transaction(
      ["searchIndexAccounts", "searchIndexWork", "localMailMessages"],
      "readonly",
    );
    const current = await transaction
      .objectStore("searchIndexAccounts")
      .get(account.id);
    if (current?.generation !== source.generation) {
      await transaction.done;
      return;
    }
    const messages = transaction.objectStore("localMailMessages");
    const workIndex = transaction
      .objectStore("searchIndexWork")
      .index("byAccount");
    const dirty = await workIndex.getAll(account.id, 100);
    indexing ||= dirty.length > 0;
    const candidates = new Map<string, SearchMessage>();
    let bytes = 0;
    let consumed = request.cursors?.[account.id] ?? undefined;
    for (const hit of page.messages) {
      const record = await messages.get([account.id, hit.id]);
      if (!record) {
        consumed = hit.rowId;
        continue;
      }
      if (bytes && bytes + record.byteSize > 8_388_608) {
        indexing = true;
        cursors[account.id] = consumed ?? hit.rowId;
        break;
      }
      bytes += record.byteSize;
      consumed = hit.rowId;
      candidates.set(record.messageId, record.data);
    }
    const changedThreads = new Set(dirty.map((work) => work.threadId));
    const mutations = request.mutations
      .filter((mutation) => mutation.emailAccountId === account.id)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    for (const mutation of mutations) changedThreads.add(mutation.threadId);
    let examined = 0;
    for (const threadId of changedThreads) {
      if (examined >= 100 || bytes > 8_388_608) {
        indexing = true;
        break;
      }
      let cursor = await messages
        .index("byAccountThreadMessage")
        .openCursor(
          IDBKeyRange.bound(
            [account.id, threadId, ""],
            [account.id, threadId, []],
          ),
        );
      while (cursor && examined < 100 && bytes <= 8_388_608) {
        examined++;
        bytes += cursor.value.byteSize;
        candidates.set(cursor.value.messageId, cursor.value.data);
        cursor = await cursor.continue();
      }
      if (cursor) indexing = true;
    }
    const byThread = new Map<string, SearchMessage[]>();
    for (const candidate of candidates.values()) {
      let message = candidate;
      for (const mutation of mutations) {
        if (
          mutation.threadId === message.threadId &&
          mutation.messageIds.includes(message.id)
        )
          message = applyMailMutationToMessage(message, mutation);
      }
      if (!matchesLocalSearch(message, parsed[position]!)) continue;
      const threadMessages = byThread.get(message.threadId) ?? [];
      threadMessages.push(message);
      byThread.set(message.threadId, threadMessages);
    }
    for (const threadId of byThread.keys()) {
      const hydrated: SearchMessage[] = [];
      let cursor = await messages
        .index("byAccountThreadMessage")
        .openCursor(
          IDBKeyRange.bound(
            [account.id, threadId, ""],
            [account.id, threadId, []],
          ),
        );
      while (cursor && hydrated.length < 500 && bytes <= 16_777_216) {
        bytes += cursor.value.byteSize;
        let message: SearchMessage = cursor.value.data;
        for (const mutation of mutations) {
          if (
            mutation.threadId === threadId &&
            mutation.messageIds.includes(message.id)
          )
            message = applyMailMutationToMessage(message, mutation);
        }
        // Results retain metadata, not another copy of cached message bodies.
        hydrated.push({ ...message, textPlain: undefined });
        cursor = await cursor.continue();
      }
      if (cursor) indexing = true;
      if (hydrated.length) byThread.set(threadId, hydrated);
    }
    await transaction.done;
    if (
      !isEmailCacheEpochCurrent(account.id, epoch) ||
      (await database.get("searchIndexAccounts", account.id))?.generation !==
        source.generation
    )
      return;
    for (const [id, matched] of byThread) {
      matched.sort((a, b) => timestamp(a) - timestamp(b));
      const listMessages = matched.map((message) => ({
        id: message.id,
        threadId: message.threadId,
        date: message.date ?? "",
        internalDate: message.internalDate,
        subject: message.subject,
        snippet: message.snippet,
        headers: message.headers,
        labelIds: message.labelIds,
        parentFolderId: message.parentFolderId,
      }));
      results.push({
        emailAccountId: account.id,
        thread: {
          id,
          messages: listMessages,
          messageIds: listMessages.map((message) => message.id),
          snippet: listMessages.at(-1)?.snippet ?? "",
          participantMessages: undefined,
          plan: undefined,
          plans: [],
        },
      });
    }
  }
  results.sort(
    (a, b) =>
      timestamp(b.thread.messages.at(-1)) -
        timestamp(a.thread.messages.at(-1)) ||
      a.emailAccountId.localeCompare(b.emailAccountId) ||
      a.thread.id.localeCompare(b.thread.id),
  );
  return {
    status: "ready",
    threads: results,
    cursors: Object.values(cursors).some(Boolean) ? cursors : undefined,
    coverage: indexing ? "indexing" : "partial",
  };
}

function timestamp(
  message: Pick<SearchMessage, "internalDate" | "date"> | undefined,
) {
  const value = message?.internalDate || message?.date || "";
  return (/^\d+$/u.test(value) ? Number(value) : Date.parse(value)) || 0;
}
