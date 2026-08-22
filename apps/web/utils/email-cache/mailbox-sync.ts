import type { MailboxSyncResponse } from "@/app/api/mobile/mailbox-sync/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { ONE_DAY_MS } from "@/utils/date";
import { captureEmailCacheEpoch, isEmailCacheEpochCurrent } from "./database";
import { applyMailboxSyncPage, readMailboxSyncState } from "./mailbox";

const DEFAULT_SYNC_DAYS = 30;
const SYNC_WINDOW_REFRESH_DAYS = 7;
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = 10;

export type MailboxSyncInput = {
  after?: string;
  cursor?: string;
  limit: number;
};

export async function syncMailboxPages({
  emailAccountId,
  fetchPage,
  now,
  maxPages = DEFAULT_MAX_PAGES,
}: {
  emailAccountId: string;
  fetchPage: (input: MailboxSyncInput) => Promise<MailboxSyncResponse>;
  now?: Date;
  maxPages?: number;
}) {
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error("maxPages must be a positive integer");
  }

  const epoch = captureEmailCacheEpoch(emailAccountId);
  if (!epoch) return { hasMore: false, pagesSynced: 0 };
  const syncStartedAt = now ?? new Date();
  const state = await readMailboxSyncState(emailAccountId);
  if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) {
    return { hasMore: false, pagesSynced: 0 };
  }
  const stateAfterTimestamp = state
    ? new Date(state.after).getTime()
    : Number.NaN;
  const resumeCursor =
    state?.cursor &&
    Number.isFinite(stateAfterTimestamp) &&
    stateAfterTimestamp >=
      syncStartedAt.getTime() -
        (DEFAULT_SYNC_DAYS + SYNC_WINDOW_REFRESH_DAYS) * ONE_DAY_MS
      ? state.cursor
      : undefined;
  const initialAfter = new Date(
    syncStartedAt.getTime() - DEFAULT_SYNC_DAYS * ONE_DAY_MS,
  );
  let input: MailboxSyncInput = resumeCursor
    ? { cursor: resumeCursor, limit: DEFAULT_PAGE_LIMIT }
    : { after: initialAfter.toISOString(), limit: DEFAULT_PAGE_LIMIT };
  let hasMore = true;
  let pagesSynced = 0;

  while (hasMore && pagesSynced < maxPages) {
    const response = await fetchPage(input);
    if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) {
      return { hasMore: false, pagesSynced };
    }
    if (response.accountId !== emailAccountId) {
      throw new Error("Mailbox sync response account mismatch");
    }
    const { accountId: _accountId, ...page } = response;
    await applyMailboxSyncPage({
      emailAccountId,
      page,
      after: resumeCursor ? undefined : initialAfter,
      now: now?.getTime() ?? Date.now(),
    });
    pagesSynced += 1;
    hasMore = page.hasMore;
    input = { cursor: page.cursor, limit: DEFAULT_PAGE_LIMIT };
  }

  return { hasMore, pagesSynced };
}

export async function fetchMailboxSyncPage(
  emailAccountId: string,
  input: MailboxSyncInput,
): Promise<MailboxSyncResponse> {
  const response = await fetch("/api/mobile/mailbox-sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [EMAIL_ACCOUNT_HEADER]: emailAccountId,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Mailbox sync failed with status ${response.status}`);
  }
  return response.json();
}
