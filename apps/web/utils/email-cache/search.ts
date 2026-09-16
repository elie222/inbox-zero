import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import type { ThreadListItem } from "@/utils/threads/load";
import type { EmailLabel } from "@/providers/email-label-types";
import type { ParsedMessage } from "@/utils/types";
import { getEmailCacheDatabase } from "./database";
import {
  matchesLocalSearch,
  parseLocalSearch,
  type SearchMessage,
} from "./search-query";
import {
  EMAIL_CACHE_MAX_AGE_MS,
  EMAIL_CACHE_SEARCH_MAX_MESSAGES,
  EMAIL_CACHE_MAILBOX_MAX_AGE_MS,
} from "./policy";
import type { MailMutation } from "./mail-mutations";
import { applyMailMutationToMessage } from "./mail-mutation-overlay";

export type LocalSearchRequest = {
  query: string;
  accounts: { id: string; labels: Pick<EmailLabel, "id" | "name">[] }[];
  mutations: MailMutation[];
};
export type LocalSearchResult = {
  status: "ready" | "unsupported" | "unavailable";
  threads: { emailAccountId: string; thread: ThreadListItem }[];
};

// This is a partial, disposable view of the existing cache, not a second copy of mail.
const MAX_DETAIL_RECORDS = 100;
const MAX_BODY_CHARACTERS = 100_000;
const MAX_RESULTS = 100;

export async function searchCachedMail({
  query,
  accounts,
  mutations,
}: LocalSearchRequest): Promise<LocalSearchResult> {
  const parsed = accounts.map((account) =>
    parseLocalSearch(query, account.labels),
  );
  if (!accounts.length || parsed.some((value) => !value))
    return { status: "unsupported", threads: [] };
  const database = await getEmailCacheDatabase();
  if (!database) return { status: "unavailable", threads: [] };
  const results: LocalSearchResult["threads"] = [];
  for (const [accountIndex, account] of accounts.entries()) {
    const transaction = database.transaction(
      ["mailboxMessages", "threadRows", "threadDetails"],
      "readonly",
    );
    const messageIndex = transaction
      .objectStore("mailboxMessages")
      .index("byAccountReceivedAt");
    const accountRange = IDBKeyRange.bound(
      [account.id, Number.MIN_SAFE_INTEGER],
      [account.id, Number.MAX_SAFE_INTEGER],
    );
    let messageRange = accountRange;
    if (
      (await messageIndex.count(accountRange)) > EMAIL_CACHE_SEARCH_MAX_MESSAGES
    ) {
      const newest = await messageIndex.openCursor(accountRange, "prev");
      const cutoff = await newest?.advance(EMAIL_CACHE_SEARCH_MAX_MESSAGES - 1);
      if (cutoff)
        messageRange = IDBKeyRange.bound(cutoff.key, [
          account.id,
          Number.MAX_SAFE_INTEGER,
        ]);
    }
    const detailIndex = transaction
      .objectStore("threadDetails")
      .index("byAccountLastAccessed");
    let detailRange = accountRange;
    if ((await detailIndex.count(accountRange)) > MAX_DETAIL_RECORDS) {
      const newest = await detailIndex.openCursor(accountRange, "prev");
      const cutoff = await newest?.advance(MAX_DETAIL_RECORDS - 1);
      if (cutoff)
        detailRange = IDBKeyRange.bound(cutoff.key, [
          account.id,
          Number.MAX_SAFE_INTEGER,
        ]);
    }
    const rowIndex = transaction
      .objectStore("threadRows")
      .index("byAccountLastAccessed");
    let rowRange = accountRange;
    if (
      (await rowIndex.count(accountRange)) > EMAIL_CACHE_SEARCH_MAX_MESSAGES
    ) {
      const newest = await rowIndex.openCursor(accountRange, "prev");
      const cutoff = await newest?.advance(EMAIL_CACHE_SEARCH_MAX_MESSAGES - 1);
      if (cutoff)
        rowRange = IDBKeyRange.bound(cutoff.key, [
          account.id,
          Number.MAX_SAFE_INTEGER,
        ]);
    }
    const [mailbox, rows, details] = await Promise.all([
      messageIndex.getAll(messageRange, EMAIL_CACHE_SEARCH_MAX_MESSAGES),
      rowIndex.getAll(rowRange, EMAIL_CACHE_SEARCH_MAX_MESSAGES),
      detailIndex.getAll(detailRange, MAX_DETAIL_RECORDS),
    ]);
    await transaction.done;
    const messages = new Map<
      string,
      { message: SearchMessage; fetchedAt: number }
    >();
    const now = Date.now();
    const add = (message: SearchMessage, fetchedAt: number) => {
      const previous = messages.get(message.id);
      if (previous && previous.fetchedAt > fetchedAt) return;
      messages.set(message.id, { message, fetchedAt });
    };
    for (const detail of details) {
      if (now - detail.fetchedAt > EMAIL_CACHE_MAX_AGE_MS) continue;
      for (const message of (detail.data as ThreadResponse).thread.messages) {
        add(
          {
            ...message,
            textPlain: message.textPlain?.slice(0, MAX_BODY_CHARACTERS),
          },
          detail.fetchedAt,
        );
      }
    }
    for (const row of rows) {
      if (now - row.fetchedAt > EMAIL_CACHE_MAX_AGE_MS) continue;
      const thread = row.data as Partial<ThreadListItem>;
      // Unified list snapshots wrap rows; each account's own cache supplies search data.
      if (!Array.isArray(thread.messages)) continue;
      for (const message of thread.messages) {
        const previous = messages.get(message.id);
        add(
          { ...message, textPlain: previous?.message.textPlain },
          row.fetchedAt,
        );
      }
    }
    for (const record of mailbox) {
      if (now - record.lastAccessedAt > EMAIL_CACHE_MAILBOX_MAX_AGE_MS)
        continue;
      const previous = messages.get(record.messageId);
      add(
        { ...record.data, textPlain: previous?.message.textPlain },
        record.lastAccessedAt,
      );
    }
    const accountMutations = mutations
      .filter((mutation) => mutation.emailAccountId === account.id)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const mutationsByMessage = new Map<string, MailMutation[]>();
    for (const mutation of accountMutations) {
      for (const messageId of mutation.messageIds) {
        const targetMutations = mutationsByMessage.get(messageId) ?? [];
        targetMutations.push(mutation);
        mutationsByMessage.set(messageId, targetMutations);
      }
    }
    const byThread = new Map<string, SearchMessage[]>();
    for (const { message } of messages.values()) {
      let updated = message;
      for (const mutation of mutationsByMessage.get(message.id) ?? []) {
        if (mutation.threadId === message.threadId) {
          updated = applyMailMutationToMessage(updated, mutation);
        }
      }
      const threadMessages = byThread.get(message.threadId) ?? [];
      threadMessages.push(updated);
      byThread.set(message.threadId, threadMessages);
    }
    for (const [id, threadMessages] of byThread) {
      if (
        !threadMessages.some((message) =>
          matchesLocalSearch(message, parsed[accountIndex]!),
        )
      )
        continue;
      const listMessages = threadMessages.map((message) => ({
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
      listMessages.sort((a, b) => timestamp(a) - timestamp(b));
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
  return { status: "ready", threads: results.slice(0, MAX_RESULTS) };
}

function timestamp(
  message: Pick<ParsedMessage, "internalDate" | "date"> | undefined,
) {
  const value = message?.internalDate || message?.date || "";
  return (/^\d+$/u.test(value) ? Number(value) : Date.parse(value)) || 0;
}
