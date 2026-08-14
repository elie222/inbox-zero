import { internalDateToDate } from "@/utils/date";
import type { Logger } from "@/utils/logger";
import { mapWithConcurrency } from "@/utils/async";
import type { ThreadListItem } from "@/utils/threads/load";

const ACCOUNT_CONCURRENCY = 4;

export type CombinedThreadsAccount = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  provider: string;
};

type AccountCursor = Record<string, string | null>;

export type CombinedListThread = ThreadListItem & {
  account: Pick<CombinedThreadsAccount, "id" | "email" | "name" | "image">;
};

export async function loadCombinedThreads({
  accounts,
  cursor,
  loadPage,
  logger,
}: {
  accounts: CombinedThreadsAccount[];
  cursor: string | null;
  loadPage: (input: {
    account: CombinedThreadsAccount;
    pageToken?: string;
  }) => Promise<{
    threads: ThreadListItem[];
    nextPageToken?: string | null;
  }>;
  logger: Logger;
}) {
  const previousCursor = decodeCursor(cursor);
  const accountsToLoad = previousCursor
    ? accounts.filter((account) => previousCursor[account.id])
    : accounts;

  const pages = await mapWithConcurrency(
    accountsToLoad,
    ACCOUNT_CONCURRENCY,
    async (account) => {
      try {
        const page = await loadPage({
          account,
          pageToken: previousCursor?.[account.id] || undefined,
        });
        return { account, page };
      } catch (error) {
        logger.warn("Failed to load combined mailbox account", {
          error,
          emailAccountId: account.id,
        });
        return { account, page: null };
      }
    },
  );

  const nextCursor: AccountCursor = {};
  const failedAccountIds: string[] = [];
  const threads: CombinedListThread[] = [];

  for (const { account, page } of pages) {
    if (!page) {
      failedAccountIds.push(account.id);
      nextCursor[account.id] = null;
      continue;
    }

    nextCursor[account.id] = page.nextPageToken || null;
    threads.push(
      ...page.threads.map((thread) => ({
        ...thread,
        account: {
          id: account.id,
          email: account.email,
          name: account.name,
          image: account.image,
        },
      })),
    );
  }

  threads.sort((left, right) => threadTimestamp(right) - threadTimestamp(left));

  return {
    threads,
    nextPageToken: Object.values(nextCursor).some(Boolean)
      ? encodeCursor(nextCursor)
      : null,
    failedAccountIds,
  };
}

function threadTimestamp(thread: ThreadListItem) {
  const internalDate = thread.messages.at(-1)?.internalDate;
  return (
    internalDateToDate(internalDate, { fallbackToNow: false }).getTime() || 0
  );
}

function encodeCursor(cursor: AccountCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(cursor: string | null): AccountCursor | null {
  if (!cursor) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string | null] =>
          typeof entry[1] === "string" || entry[1] === null,
      ),
    );
  } catch {
    return null;
  }
}
