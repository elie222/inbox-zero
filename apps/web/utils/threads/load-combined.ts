import type { Logger } from "@/utils/logger";
import { mapWithConcurrency } from "@/utils/async";
import type { EmailLabel, EmailLabels } from "@/providers/email-label-types";
import type { ThreadListItem } from "@/utils/threads/load";
import { getThreadTimestamp } from "@/utils/threads/sort";

const ACCOUNT_CONCURRENCY = 4;
const INITIAL_ACCOUNT_CURSOR: AccountCursorState = {
  pageToken: null,
  consumedThreadIds: [],
  done: false,
};
const DONE_ACCOUNT_CURSOR: AccountCursorState = {
  pageToken: null,
  consumedThreadIds: [],
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
  consumedThreadIds: string[];
  done: boolean;
};

type CombinedCursor = {
  version: 2;
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
    labels?: EmailLabel[];
  }>;
  logger: Logger;
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
        return { account, cursorState, page };
      } catch (error) {
        logger.warn("Failed to load combined mailbox account", {
          error,
          emailAccountId: account.id,
        });
        return { account, cursorState, page: null };
      }
    },
  );

  const failedAccountIds: string[] = [];
  const candidates: CombinedListThread[] = [];
  const labelsByAccount: Record<string, EmailLabels> = {};

  for (const { account, cursorState, page } of accountPages) {
    if (!page) {
      failedAccountIds.push(account.id);
      continue;
    }

    if (page.labels) {
      labelsByAccount[account.id] = Object.fromEntries(
        page.labels.map((label) => [label.id, label]),
      );
    }

    const consumedThreadIds = new Set(cursorState.consumedThreadIds);
    candidates.push(
      ...page.threads
        .filter((thread) => !consumedThreadIds.has(thread.id))
        .map((thread) => ({
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
  const returnedThreadIdsByAccount = getThreadIdsByAccount(threads);
  const pagesByAccountId = new Map(
    accountPages.map((page) => [page.account.id, page]),
  );
  const nextCursor = emptyCursor();

  for (const account of accounts) {
    const accountPage = pagesByAccountId.get(account.id);
    if (!accountPage) {
      nextCursor.accounts[account.id] =
        previousCursor.accounts[account.id] ?? INITIAL_ACCOUNT_CURSOR;
      continue;
    }
    if (!accountPage.page) {
      nextCursor.accounts[account.id] = accountPage.cursorState;
      continue;
    }

    const consumedThreadIds = new Set([
      ...accountPage.cursorState.consumedThreadIds,
      ...(returnedThreadIdsByAccount.get(account.id) ?? []),
    ]);
    const hasUnconsumedThreads = accountPage.page.threads.some(
      (thread) => !consumedThreadIds.has(thread.id),
    );
    if (hasUnconsumedThreads) {
      nextCursor.accounts[account.id] = {
        ...accountPage.cursorState,
        consumedThreadIds: [...consumedThreadIds],
      };
    } else if (accountPage.page.nextPageToken) {
      nextCursor.accounts[account.id] = {
        pageToken: accountPage.page.nextPageToken,
        consumedThreadIds: [],
        done: false,
      };
    } else {
      nextCursor.accounts[account.id] = DONE_ACCOUNT_CURSOR;
    }
  }

  return {
    threads,
    labelsByAccount,
    nextPageToken: Object.values(nextCursor.accounts).some(
      (state) => !state.done,
    )
      ? encodeCursor(nextCursor)
      : null,
    failedAccountIds,
  };
}

function getThreadIdsByAccount(threads: CombinedListThread[]) {
  const threadIds = new Map<string, string[]>();
  for (const thread of threads) {
    const accountThreadIds = threadIds.get(thread.account.id) ?? [];
    accountThreadIds.push(thread.id);
    threadIds.set(thread.account.id, accountThreadIds);
  }
  return threadIds;
}

function encodeCursor(cursor: CombinedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(cursor: string | null): CombinedCursor {
  if (!cursor) return emptyCursor();

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      !isRecord(parsed) ||
      parsed.version !== 2 ||
      !isRecord(parsed.accounts)
    ) {
      return emptyCursor();
    }

    const accounts = Object.fromEntries(
      Object.entries(parsed.accounts).filter(
        (entry): entry is [string, AccountCursorState] =>
          isAccountCursorState(entry[1]),
      ),
    );
    return { version: 2, accounts };
  } catch {
    return emptyCursor();
  }
}

function emptyCursor(): CombinedCursor {
  return { version: 2, accounts: {} };
}

function isAccountCursorState(value: unknown): value is AccountCursorState {
  return (
    isRecord(value) &&
    (typeof value.pageToken === "string" || value.pageToken === null) &&
    Array.isArray(value.consumedThreadIds) &&
    value.consumedThreadIds.every((threadId) => typeof threadId === "string") &&
    typeof value.done === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
