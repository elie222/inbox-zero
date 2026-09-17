import { captureLocalMailCacheContext } from "@/utils/email-cache/local-mail-cache-context";
import type { MailboxSyncResponse } from "@/app/api/mobile/mailbox-sync/route";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { ONE_DAY_MS } from "@/utils/date";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { captureEmailCacheEpoch, isEmailCacheEpochCurrent } from "./database";
import { applyMailboxSyncPage, readMailboxSyncState } from "./mailbox";
import {
  claimMailboxSyncJob,
  finishMailboxSyncJob,
  renewMailboxSyncJob,
} from "./mailbox-sync-job";

const DEFAULT_SYNC_DAYS = 30;
const SYNC_WINDOW_REFRESH_DAYS = 7;
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = 10;

export class MailboxSyncRequestError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(status: number, retryAfterMs?: number) {
    super(`Mailbox sync failed with status ${status}`);
    this.name = "MailboxSyncRequestError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

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
  force = false,
}: {
  emailAccountId: string;
  fetchPage: (input: MailboxSyncInput) => Promise<MailboxSyncResponse>;
  now?: Date;
  maxPages?: number;
  force?: boolean;
}) {
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error("maxPages must be a positive integer");
  }

  const leaseToken = await claimMailboxSyncJob(emailAccountId, { force });
  if (!leaseToken) return { hasMore: false, pagesSynced: 0 };
  try {
    const result = await syncOwnedMailboxPages({
      emailAccountId,
      fetchPage,
      now,
      maxPages,
      leaseToken,
    });
    await finishMailboxSyncJob(emailAccountId, leaseToken, result);
    return result;
  } catch (error) {
    await finishMailboxSyncJob(emailAccountId, leaseToken, {
      retryAfterMs:
        error instanceof MailboxSyncRequestError
          ? error.retryAfterMs
          : undefined,
    }).catch(() => {});
    throw error;
  }
}

async function syncOwnedMailboxPages({
  emailAccountId,
  fetchPage,
  now,
  maxPages,
  leaseToken,
}: {
  emailAccountId: string;
  fetchPage: (input: MailboxSyncInput) => Promise<MailboxSyncResponse>;
  now?: Date;
  maxPages: number;
  leaseToken: string;
}) {
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
    if (!(await renewMailboxSyncJob(emailAccountId, leaseToken))) {
      return { hasMore: true, pagesSynced };
    }
    const cacheContext = await captureLocalMailCacheContext(emailAccountId);
    const response = await fetchPage(input);
    if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) {
      return { hasMore: false, pagesSynced: 0 };
    }
    if (response.accountId !== emailAccountId) {
      throw new Error("Mailbox sync response account mismatch");
    }
    const { accountId: _accountId, ...page } = response;
    const applied = await applyMailboxSyncPage({
      emailAccountId,
      page,
      cacheContext,
      after: resumeCursor ? undefined : initialAfter,
      leaseToken,
      now: now?.getTime() ?? Date.now(),
    });
    if (!applied) throw new Error("Mailbox sync page was not persisted");
    if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) {
      return { hasMore: false, pagesSynced };
    }
    const notifyNewMail = getInboxZeroDesktopApp()?.notifyNewMail;
    if (notifyNewMail) {
      const messages = page.upsertedMessages
        .filter(
          (message) =>
            message.labelIds?.includes("INBOX") &&
            message.labelIds.includes("UNREAD"),
        )
        .map((message) => ({
          id: message.id,
          receivedAt: Number.isFinite(Number(message.internalDate))
            ? Number(message.internalDate)
            : Date.parse(message.internalDate ?? ""),
        }));
      // Provider history pages can expand beyond the desktop IPC batch limit.
      for (let offset = 0; offset < messages.length; offset += 100) {
        notifyNewMail({
          emailAccountId,
          messages: messages.slice(offset, offset + 100),
        });
      }
    }
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
    signal: AbortSignal.timeout(90_000),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [EMAIL_ACCOUNT_HEADER]: emailAccountId,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new MailboxSyncRequestError(
      response.status,
      parseRetryAfter(response.headers.get("Retry-After")),
    );
  }
  return response.json();
}

function parseRetryAfter(value: string | null) {
  if (!value) return;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return;
  return Math.max(0, retryAt - Date.now());
}
