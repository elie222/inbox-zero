import { bootstrapLocalMailStorageLedgerBatch } from "./local-mail-storage-ledger-bootstrap";
import { createAccountedMailTransaction } from "./optional-cache-write";
import type { LocalMailSyncResponse } from "@/utils/email/local-mail-sync-types";
import { subscribeToLocalMailSyncRequests } from "./local-mail-sync-events";
import { startLocalMailHints } from "./local-mail-hints";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { getEmailCacheDatabase } from "./database";
import { isMailSyncActivated } from "./mail-activation";
import { notifyMailboxStoreChange } from "./mailbox";
import { runLocalMailSyncTick } from "./local-mail-sync";
import { LOCAL_MAIL_HISTORY_AFTER } from "./local-mail-sync-state";
import {
  readLocalMailStorageAdmission,
  withLocalMailStorageLock,
} from "./local-mail-storage";
import { initializeSearchIndexAccount } from "./search-index-seed";
import {
  warmSearchIndexStorage,
  isSearchIndexStoragePaused,
} from "./search-index-service";
import { readSearchIndexWork } from "./search-index-work";
import { relieveLocalMailStoragePressure } from "./local-mail-storage-pressure";

type Entry = {
  references: number;
  priority: boolean;
  running: boolean;
  nextAt: number;
  lastServed: number;
  lastNotified: number;
  lastCountsAt: number;
  refreshCounts: boolean;
  forceCounts: boolean;
  notificationTimer?: ReturnType<typeof setTimeout>;
  stopHints?: () => void;
  pendingCatchUp?: boolean;
  nextPressureAt?: number;
  pressureRequested?: boolean;
};
const entries = new Map<string, Entry>();
let timer: ReturnType<typeof setTimeout> | undefined;
let running = 0;
let accountingRunning = false;
let accountingReady = false;
let indexWarmed = false;
let nextAccountingAt = 0;
let sequence = 0;
let lastActivityAt = 0;
let lastCatchUpAt = 0;
let unsubscribeRequests: (() => void) | undefined;

export function retainLocalMailSync(emailAccountId: string, priority: boolean) {
  const entry = entries.get(emailAccountId) ?? {
    references: 0,
    priority,
    running: false,
    nextAt: 0,
    lastServed: 0,
    lastNotified: 0,
    lastCountsAt: 0,
    refreshCounts: false,
    forceCounts: false,
  };
  entry.references += 1;
  entry.priority = priority;
  entries.set(emailAccountId, entry);
  if (entry.references === 1)
    entry.stopHints = startLocalMailHints(emailAccountId, () =>
      requestLocalMailSync(emailAccountId, false),
    );
  if (entries.size === 1 && entry.references === 1) {
    lastActivityAt = Date.now();
    nextAccountingAt = 0;
    accountingReady = false;
    indexWarmed = false;
    unsubscribeRequests =
      subscribeToLocalMailSyncRequests(requestLocalMailSync);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity, { passive: true });
    window.addEventListener("scroll", activity, {
      passive: true,
      capture: true,
    });
  }
  schedule(0);
  return () => {
    entry.references -= 1;
    if (!entry.references) {
      entry.stopHints?.();
      clearTimeout(entry.notificationTimer);
      entries.delete(emailAccountId);
    }
    if (!entries.size) {
      clearTimeout(timer);
      unsubscribeRequests?.();
      unsubscribeRequests = undefined;
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("scroll", activity, true);
    }
  };
}

export function setLocalMailSyncPriority(
  emailAccountId: string,
  priority: boolean,
) {
  const entry = entries.get(emailAccountId);
  if (!entry || entry.priority === priority) return;
  entry.priority = priority;
  schedule(0);
}

function requestLocalMailSync(emailAccountId: string, forceCounts = true) {
  const entry = entries.get(emailAccountId);
  if (!entry) return;
  entry.nextAt = 0;
  entry.forceCounts ||= forceCounts;
  if (entry.running) {
    entry.pendingCatchUp = true;
    return;
  }
  expediteCurrentJobs(emailAccountId).finally(() => schedule(0));
}

async function tick(emailAccountId: string, entry: Entry) {
  try {
    await initializeSearchIndexAccount(emailAccountId);
    const backlog = await readSearchIndexWork(emailAccountId);
    const database = await getEmailCacheDatabase();
    const retainedState = await database?.get(
      "localMailSyncStates",
      emailAccountId,
    );
    const eviction = await database?.get(
      "localMailEvictionJobs",
      emailAccountId,
    );
    let pressure:
      | Awaited<ReturnType<typeof relieveLocalMailStoragePressure>>
      | undefined;
    if (
      (entry.pressureRequested ||
        retainedState?.storagePaused ||
        eviction?.stage) &&
      Date.now() >= (entry.nextPressureAt ?? 0)
    ) {
      entry.pressureRequested = false;
      try {
        pressure = await relieveLocalMailStoragePressure({
          emailAccountIds: [...entries.keys()],
        });
        entry.nextPressureAt =
          Date.now() +
          (pressure === "progress"
            ? 250
            : pressure === "waiting-index"
              ? 1000
              : 60_000);
      } catch {
        // Another tab may own storage maintenance; current mail still gets its tick.
        entry.pressureRequested = true;
        entry.nextPressureAt = Date.now() + 1000;
      }
    }
    const policy = await database?.get(
      "localMailRetentionPolicies",
      emailAccountId,
    );
    const retentionAfter = Math.max(
      policy?.requestedAfter ?? LOCAL_MAIL_HISTORY_AFTER,
      policy?.automaticAfter ?? LOCAL_MAIL_HISTORY_AFTER,
      retainedState?.retentionAfter ?? LOCAL_MAIL_HISTORY_AFTER,
    );
    const options: Parameters<typeof runLocalMailSyncTick>[0] = {
      emailAccountId,
      retentionAfter,
      allowHistoricalWork:
        !eviction?.stage &&
        pressure !== "progress" &&
        document.visibilityState !== "hidden" &&
        Date.now() - lastActivityAt < 5 * 60_000 &&
        !isSearchIndexStoragePaused(emailAccountId) &&
        !!backlog &&
        backlog.work.length < 100 &&
        backlog.blockedCount === 0,
      admitBackfill: async () =>
        (await readLocalMailStorageAdmission()).allowed,
      withStorageLock: withLocalMailStorageLock,
      admitResponse: async (response, purpose) => {
        const database = await getEmailCacheDatabase();
        if (!database)
          return { allowed: false, maxGrowthBytes: 0, logicalLimitBytes: 0 };
        const responseBytes = new Blob([JSON.stringify(response)]).size;
        const admission = await readLocalMailStorageAdmission({
          expectedGrowthBytes: responseBytes,
          purpose,
        });
        return {
          allowed:
            admission.allowed ||
            (admission.reason === "storage-full" &&
              isDeletionOnlyResponse(response)),
          maxGrowthBytes: admission.remainingBytes,
          logicalLimitBytes: admission.limitBytes,
        };
      },
    };
    const result = await runLocalMailSyncTick(options);
    if (
      "newMail" in result &&
      result.newMail?.length &&
      isMailSyncActivated(emailAccountId)
    )
      getInboxZeroDesktopApp()?.notifyNewMail?.({
        emailAccountId,
        messages: result.newMail,
      });
    entry.nextAt =
      "retryAt" in result &&
      typeof result.retryAt === "number" &&
      Number.isFinite(result.retryAt)
        ? Math.max(Date.now() + 250, result.retryAt)
        : Date.now() + (result.status === "progress" ? 250 : 5000);
    if (pressure === "progress" || pressure === "waiting-index")
      entry.nextAt = Math.min(
        entry.nextAt,
        entry.nextPressureAt ?? entry.nextAt,
      );
    if (
      "currentUpdate" in result &&
      result.currentUpdate &&
      (entry.forceCounts || Date.now() - entry.lastCountsAt >= 60_000)
    )
      entry.refreshCounts = true;
    if (
      result.status === "progress" &&
      entries.get(emailAccountId) === entry &&
      !entry.notificationTimer
    ) {
      entry.notificationTimer = setTimeout(
        () => {
          entry.notificationTimer = undefined;
          entry.lastNotified = Date.now();
          notifyMailboxStoreChange(emailAccountId, {
            refreshCounts: entry.refreshCounts,
          });
          if (entry.refreshCounts) {
            entry.lastCountsAt = Date.now();
            entry.forceCounts = false;
            entry.refreshCounts = false;
          }
        },
        Math.max(0, 2000 - (Date.now() - entry.lastNotified)),
      );
    }
  } catch {
    entry.nextAt = Date.now() + 5000;
  } finally {
    entry.running = false;
    running -= 1;
    if (entry.pendingCatchUp && entries.get(emailAccountId) === entry) {
      entry.pendingCatchUp = false;
      requestLocalMailSync(emailAccountId, false);
    }
    schedule(250);
  }
}

function pump() {
  if (!entries.size) return;
  if (
    !navigator.locks?.request ||
    navigator.onLine === false ||
    (document.visibilityState === "hidden" && !getInboxZeroDesktopApp())
  ) {
    schedule(60_000);
    return;
  }
  const now = Date.now();
  if (
    !accountingRunning &&
    now >= nextAccountingAt &&
    [...entries.keys()].some(isMailSyncActivated)
  ) {
    accountingRunning = true;
    bootstrapLocalMailStorageLedgerBatch()
      .then(async (result) => {
        accountingReady = result === "ready";
        if (
          result === "waiting-index" ||
          (result === "ready" && !indexWarmed)
        ) {
          const id = [...entries.keys()].find(isMailSyncActivated);
          if (id) {
            const account = await initializeSearchIndexAccount(id);
            accountingReady = false;
            if (account) {
              indexWarmed = await warmSearchIndexStorage({
                emailAccountId: id,
                generation: account.generation,
              });
              accountingReady = indexWarmed;
            }
          }
        }
        nextAccountingAt =
          Date.now() +
          (result === "progress" ? 0 : accountingReady ? 60_000 : 1000);
      })
      .catch(() => {
        nextAccountingAt = Date.now() + 5000;
      })
      .finally(() => {
        accountingRunning = false;
        schedule(
          accountingReady
            ? 0
            : Math.max(0, Math.min(250, nextAccountingAt - Date.now())),
        );
      });
  }

  const candidates = [...entries]
    .filter(
      ([id, entry]) =>
        accountingReady &&
        !entry.running &&
        entry.nextAt <= now &&
        isMailSyncActivated(id),
    )
    .sort(
      ([, a], [, b]) =>
        a.lastServed - b.lastServed || Number(b.priority) - Number(a.priority),
    );
  for (const [id, entry] of candidates) {
    if (running >= 2) break;
    entry.running = true;
    entry.lastServed = ++sequence;
    running += 1;
    tick(id, entry);
  }
  const next = Math.min(
    ...[...entries.values()]
      .filter((entry) => !entry.running)
      .map((entry) => entry.nextAt),
  );
  schedule(Math.max(250, Math.min(60_000, next - Date.now())));
}

function schedule(delay: number) {
  clearTimeout(timer);
  if (entries.size) timer = setTimeout(pump, delay);
}

function activity() {
  const wasInactive = Date.now() - lastActivityAt >= 5 * 60_000;
  lastActivityAt = Date.now();
  if (wasInactive) wake();
}

function wake() {
  if (document.visibilityState !== "hidden") lastActivityAt = Date.now();
  const catchUp = Date.now() - lastCatchUpAt >= 10_000;
  if (catchUp) lastCatchUpAt = Date.now();
  for (const [id, entry] of entries) {
    entry.nextAt = 0;
    if (catchUp) requestLocalMailSync(id, false);
  }
  schedule(0);
}

async function expediteCurrentJobs(emailAccountId: string) {
  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isMailSyncActivated(emailAccountId)) return;
    const transaction = await createAccountedMailTransaction(database, [
      "localMailSyncStates",
      "localMailSyncJobs",
    ]);
    const state = await transaction
      .objectStore("localMailSyncStates")
      .get(emailAccountId);
    if (
      state &&
      !state.storagePaused &&
      !state.leaseOwner &&
      state.nextAttemptAt <= Date.now()
    ) {
      const jobs = await transaction
        .objectStore("localMailSyncJobs")
        .index("byAccount")
        .getAll(emailAccountId);
      for (const job of jobs) {
        if (
          ["current", "delta"].includes(job.kind) &&
          !(
            state.recovering &&
            job.kind === "current" &&
            job.request.phase !== "history-baseline"
          ) &&
          !job.pending &&
          job.attempts === 0
        ) {
          job.nextAttemptAt = Date.now();
          await transaction.objectStore("localMailSyncJobs").put(job);
        }
      }
    }
    await transaction.done;
  } catch {
    // The next bounded tick retries after cache availability changes.
  }
}

function isDeletionOnlyResponse(response: LocalMailSyncResponse) {
  if (response.status !== "ok") return false;
  if (response.phase === "history-changes")
    return response.result.messageIds.length === 0;
  if (
    response.phase === "history-hydrate" ||
    response.phase === "folder-changes" ||
    response.phase === "folder-backfill"
  )
    return response.result.messages.length === 0;
  return (
    response.phase === "message-lookup" && response.result.status === "notFound"
  );
}
