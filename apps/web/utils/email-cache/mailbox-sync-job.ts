import { randomUuid } from "@/utils/uuid";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";

const LEASE_MS = 120_000;
const MAX_RETRY_MS = 15 * 60_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

export class MailboxSyncDeferredError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("Mailbox sync is waiting for another owner or a retry deadline");
    this.name = "MailboxSyncDeferredError";
    this.retryAfterMs = retryAfterMs;
  }
}

export async function claimMailboxSyncJob(
  emailAccountId: string,
  { force = false } = {},
) {
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
  const transaction = database.transaction("mailboxSyncJobs", "readwrite");
  const previous = await transaction.store.get(emailAccountId);
  const now = Date.now();
  const waitUntil = Math.max(
    previous?.leaseExpiresAt ?? 0,
    previous?.retryAt ?? 0,
    force ? 0 : (previous?.nextPollAt ?? 0),
  );
  if (waitUntil > now) {
    await transaction.done;
    throw new MailboxSyncDeferredError(waitUntil - now);
  }
  const leaseToken = randomUuid();
  await transaction.store.put({
    emailAccountId,
    leaseToken,
    leaseExpiresAt: now + LEASE_MS,
    retryAt: 0,
    nextPollAt: previous?.nextPollAt ?? 0,
    failures: previous?.failures ?? 0,
  });
  await transaction.done;
  return leaseToken;
}

export async function renewMailboxSyncJob(
  emailAccountId: string,
  leaseToken: string,
) {
  const database = await getEmailCacheDatabase();
  if (!database) return false;
  const transaction = database.transaction("mailboxSyncJobs", "readwrite");
  const job = await transaction.store.get(emailAccountId);
  const now = Date.now();
  if (!job || job.leaseToken !== leaseToken || job.leaseExpiresAt <= now) {
    await transaction.done;
    return false;
  }
  await transaction.store.put({ ...job, leaseExpiresAt: now + LEASE_MS });
  await transaction.done;
  return true;
}

export async function finishMailboxSyncJob(
  emailAccountId: string,
  leaseToken: string,
  outcome: { hasMore: boolean } | { retryAfterMs?: number },
) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction("mailboxSyncJobs", "readwrite");
  const job = await transaction.store.get(emailAccountId);
  if (
    !job ||
    job.leaseToken !== leaseToken ||
    job.leaseExpiresAt <= Date.now()
  ) {
    await transaction.done;
    return;
  }
  const failure = "hasMore" in outcome ? undefined : outcome;
  const failures = failure ? Math.min(job.failures + 1, 20) : 0;
  const exponentialDelay = Math.min(60_000 * 2 ** (failures - 1), MAX_RETRY_MS);
  const jitteredDelay = Math.min(
    Math.round(exponentialDelay * (0.8 + Math.random() * 0.4)),
    MAX_RETRY_MS,
  );
  const providerDelay = Number.isFinite(failure?.retryAfterMs)
    ? Math.max(0, Math.min(failure?.retryAfterMs ?? 0, MAX_TIMEOUT_MS))
    : 0;
  await transaction.store.put({
    emailAccountId,
    leaseExpiresAt: 0,
    failures,
    retryAt: failure ? Date.now() + Math.max(jitteredDelay, providerDelay) : 0,
    nextPollAt:
      "hasMore" in outcome
        ? Date.now() + (outcome.hasMore ? 10_000 : 60_000)
        : job.nextPollAt,
  });
  await transaction.done;
}
