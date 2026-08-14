import type { Logger } from "@/utils/logger";
import { mapWithConcurrency } from "@/utils/async";
import type { ThreadListItem } from "@/utils/threads/load";
import { getThreadTimestamp } from "@/utils/threads/sort";

const ACCOUNT_CONCURRENCY = 4;
const INITIAL_ACCOUNT_CURSOR: AccountCursorState = {
  pageToken: null,
  offset: 0,
  done: false,
};
const DONE_ACCOUNT_CURSOR: AccountCursorState = {
  pageToken: null,
  offset: 0,
  done: true,
};

export type CombinedThreadsAccount = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  provider: string;
};

type AccountCursorState = {
  pageToken: string | null;
  offset: number;
  done: boolean;
};

type CombinedCursor = {
  version: 1;
  accounts: Record<string, AccountCursorState>;
};

export type CombinedListThread = ThreadListItem & {
  account: Pick<CombinedThreadsAccount, "id" | "email" | "name" | "image">;
};

export async function loadCombinedThreads({
  accounts,
  cursor,
  limit,
  loadPage,
  logger,
  isRetryableError,
}: {
  accounts: CombinedThreadsAccount[];
  cursor: string | null;
  limit: number;
  loadPage: (input: {
    account: CombinedThreadsAccount;
    pageToken?: string;
  }) => Promise<{
    threads: ThreadListItem[];
    nextPageToken?: string | null;
  }>;
  logger: Logger;
  isRetryableError?: (error: unknown) => boolean;
}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }

  const previousCursor = decodeCursor(cursor);
  const accountsToLoad = accounts.filter(
    (account) => !previousCursor.accounts[account.id]?.done,
  );

  const accountPages = await mapWithConcurrency(
    accountsToLoad,
    ACCOUNT_CONCURRENCY,
    async (account) => {
      const cursorState =
        previousCursor.accounts[account.id] ?? INITIAL_ACCOUNT_CURSOR;
      try {
        const page = await loadPage({
          account,
          pageToken: cursorState.pageToken ?? undefined,
        });
        return { account, cursorState, page, shouldRetry: false };
      } catch (error) {
        logger.warn("Failed to load combined mailbox account", {
          error,
          emailAccountId: account.id,
        });
        return {
          account,
          cursorState,
          page: null,
          shouldRetry: isRetryableError?.(error) ?? true,
        };
      }
    },
  );

  const failedAccountIds: string[] = [];
  const candidates: CombinedListThread[] = [];

  for (const { account, cursorState, page } of accountPages) {
    if (!page) {
      failedAccountIds.push(account.id);
      continue;
    }

    candidates.push(
      ...page.threads.slice(cursorState.offset).map((thread) => ({
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

  candidates.sort(
    (left, right) => getThreadTimestamp(right) - getThreadTimestamp(left),
  );
  const threads = candidates.slice(0, limit);
  const consumedByAccount = countThreadsByAccount(threads);
  const pagesByAccountId = new Map(
    accountPages.map((page) => [page.account.id, page]),
  );
  const nextCursor: CombinedCursor = { version: 1, accounts: {} };

  for (const account of accounts) {
    const accountPage = pagesByAccountId.get(account.id);
    if (!accountPage) {
      nextCursor.accounts[account.id] =
        previousCursor.accounts[account.id] ?? INITIAL_ACCOUNT_CURSOR;
      continue;
    }
    if (!accountPage.page) {
      nextCursor.accounts[account.id] = accountPage.shouldRetry
        ? accountPage.cursorState
        : DONE_ACCOUNT_CURSOR;
      continue;
    }

    const nextOffset =
      accountPage.cursorState.offset + (consumedByAccount.get(account.id) ?? 0);
    if (nextOffset < accountPage.page.threads.length) {
      nextCursor.accounts[account.id] = {
        ...accountPage.cursorState,
        offset: nextOffset,
      };
    } else if (accountPage.page.nextPageToken) {
      nextCursor.accounts[account.id] = {
        pageToken: accountPage.page.nextPageToken,
        offset: 0,
        done: false,
      };
    } else {
      nextCursor.accounts[account.id] = DONE_ACCOUNT_CURSOR;
    }
  }

  return {
    threads,
    nextPageToken: Object.values(nextCursor.accounts).some(
      (state) => !state.done,
    )
      ? encodeCursor(nextCursor)
      : null,
    failedAccountIds,
  };
}

function countThreadsByAccount(threads: CombinedListThread[]) {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    counts.set(thread.account.id, (counts.get(thread.account.id) ?? 0) + 1);
  }
  return counts;
}

function encodeCursor(cursor: CombinedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(cursor: string | null): CombinedCursor {
  if (!cursor) return { version: 1, accounts: {} };

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !isRecord(parsed.accounts)
    ) {
      return { version: 1, accounts: {} };
    }

    const accounts = Object.fromEntries(
      Object.entries(parsed.accounts).filter(
        (entry): entry is [string, AccountCursorState] =>
          isAccountCursorState(entry[1]),
      ),
    );
    return { version: 1, accounts };
  } catch {
    return { version: 1, accounts: {} };
  }
}

function isAccountCursorState(value: unknown): value is AccountCursorState {
  return (
    isRecord(value) &&
    (typeof value.pageToken === "string" || value.pageToken === null) &&
    typeof value.offset === "number" &&
    Number.isInteger(value.offset) &&
    value.offset >= 0 &&
    typeof value.done === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
