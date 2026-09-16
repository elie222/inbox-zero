import type { IDBPTransaction, StoreNames } from "idb";
import type { ParsedMessage } from "@/utils/types";
import { localMailSyncAction } from "@/utils/actions/local-mail-sync";
import type { LocalMailSyncRequest } from "@/utils/actions/local-mail-sync.validation";
import type { LocalMailSyncResponse } from "@/utils/email/local-mail-sync-types";
import { randomUuid } from "@/utils/uuid";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
  type EmailCacheSchema,
} from "./database";
import { notifyEmailCacheChange } from "./cache-events";
import { isMailSyncActivated } from "./mail-activation";
import {
  applyLocalMailSyncResponse,
  sweepLocalMailSyncWindow,
} from "./local-mail-sync-transitions";
import { LOCAL_MAIL_FIRST_WINDOW_MS } from "./local-mail-sync-state";

export type LocalMailSyncTransaction = IDBPTransaction<
  EmailCacheSchema,
  StoreNames<EmailCacheSchema>[],
  "readwrite"
>;
const stores: StoreNames<EmailCacheSchema>[] = [
  "localMailSyncStates",
  "localMailSyncJobs",
  "localMailSyncSeen",
  "localMailMessages",
  "mailboxMessages",
  "localMailTombstones",
  "searchIndexAccounts",
  "searchIndexWork",
];

type Options = {
  emailAccountId: string;
  retentionAfter: number;
  allowHistoricalWork?: boolean;
  admitBackfill: () => Promise<boolean>;
  admitResponse: (
    response: LocalMailSyncResponse,
  ) => Promise<{ allowed: boolean; maxCanonicalBytes: number }>;
  withStorageLock: <T>(commit: () => Promise<T>) => Promise<T>;
  withSyncLock?: <T>(
    emailAccountId: string,
    run: () => Promise<T>,
  ) => Promise<T | undefined>;
  now?: number;
  call?: (
    emailAccountId: string,
    request: LocalMailSyncRequest,
  ) => Promise<LocalMailSyncResponse>;
};

/** Performs one durable unit of work; the caller owns scheduling and visibility. */
export async function runLocalMailSyncTick(options: Options) {
  if (
    !options.withSyncLock &&
    (typeof navigator === "undefined" || !navigator.locks?.request)
  )
    return { status: "unavailable" as const };
  const result = await (options.withSyncLock ?? withLocalMailSyncLock)(
    options.emailAccountId,
    () => runOwnedLocalMailSyncTick(options),
  );
  return (
    result ?? {
      status: "waiting" as const,
      retryAt: (options.now ?? Date.now()) + 1000,
    }
  );
}

async function runOwnedLocalMailSyncTick(options: Options) {
  const { emailAccountId } = options;
  const now = options.now ?? Date.now();
  if (
    !Number.isSafeInteger(options.retentionAfter) ||
    options.retentionAfter >= now
  )
    throw new Error("Invalid local mail retention boundary");
  if (!isMailSyncActivated(emailAccountId))
    return { status: "inactive" as const };
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch))
    return { status: "unavailable" as const };
  const owner = randomUuid();
  const claim = database.transaction(stores, "readwrite");
  const account = await claim
    .objectStore("searchIndexAccounts")
    .get(emailAccountId);
  if (!account || !isMailSyncActivated(emailAccountId)) {
    await claim.done;
    return { status: "inactive" as const };
  }
  let state = await claim
    .objectStore("localMailSyncStates")
    .get(emailAccountId);
  if (!state || state.generation !== account.generation) {
    const range = IDBKeyRange.bound([emailAccountId, ""], [emailAccountId, []]);
    await claim.objectStore("localMailSyncJobs").delete(range);
    await claim.objectStore("localMailSyncSeen").delete(range);
    state = {
      emailAccountId,
      generation: account.generation,
      fence: 0,
      retentionAfter: options.retentionAfter,
      retainedAfter: Math.max(
        options.retentionAfter,
        now - LOCAL_MAIL_FIRST_WINDOW_MS,
      ),
      snapshotBefore: now,
      nextWindowSize: LOCAL_MAIL_FIRST_WINDOW_MS,
      excludedFolderIds: [],
      folders: {},
      discoveryGeneration: 1,
      discoveryComplete: false,
      nextAttemptAt: now,
    };
    await claim.objectStore("localMailSyncJobs").put({
      emailAccountId,
      id: "capabilities",
      kind: "capabilities",
      priority: 0,
      request: { phase: "capabilities" },
      nextAttemptAt: now,
      attempts: 0,
    });
  }
  // The browser lock fences live owners; a surviving durable lease belongs to
  // a destroyed document. Provider cooldowns still survive ownership changes.
  if (state.unsupported || state.nextAttemptAt > now) {
    await claim.done;
    return {
      status: "waiting" as const,
      retryAt: state.nextAttemptAt,
    };
  }
  const jobs = await claim
    .objectStore("localMailSyncJobs")
    .index("byAccount")
    .getAll(emailAccountId);
  const activeState = state;
  const hasRetainedReconciliation = jobs.some((job) => job.kind === "retained");
  const lookupFolderIds = new Set(
    jobs.flatMap((job) =>
      job.kind === "lookup" ? (job.lookupFolderIds ?? []) : [],
    ),
  );
  const runnable = jobs.filter((candidate) => {
    if (options.allowHistoricalWork === false) {
      if (
        candidate.kind === "lookup" &&
        candidate.request.phase === "message-lookup" &&
        candidate.request.stream === "backfill"
      )
        return false;
      if (
        ["window", "sweep", "bootstrap"].includes(candidate.kind) &&
        !candidate.window?.recovery
      )
        return false;
      if (
        candidate.kind === "delta" &&
        candidate.request.phase === "folder-changes"
      ) {
        const folder = activeState.folders[candidate.request.folderId];
        if (!folder?.cursor && (!folder?.recovering || folder.round === 0))
          return false;
      }
    }
    if (
      activeState.recovering &&
      ["window", "sweep"].includes(candidate.kind) &&
      !candidate.window?.recovery
    )
      return false;
    if (
      candidate.kind === "sweep" &&
      candidate.window?.recovery &&
      !candidate.window.folderId &&
      hasRetainedReconciliation
    )
      return false;
    const folderId = candidate.window?.folderId;
    if (
      folderId &&
      candidate.kind === "window" &&
      !activeState.folders[folderId]?.cursor
    )
      return false;
    if (folderId && candidate.kind === "sweep") {
      if (
        (activeState.folders[folderId]?.round ?? 0) <
        (candidate.window?.requiredRound ?? 0)
      )
        return false;
      if (lookupFolderIds.has(folderId)) return false;
    }
    return true;
  });
  const job = runnable
    .filter((candidate) => candidate.nextAttemptAt <= now)
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.nextAttemptAt - b.nextAttemptAt ||
        a.id.localeCompare(b.id),
    )[0];
  if (!job) {
    await claim.done;
    return {
      status: "waiting" as const,
      retryAt: Math.min(
        ...runnable.map((candidate) => candidate.nextAttemptAt),
      ),
    };
  }
  state = {
    ...state,
    fence: state.fence + 1,
    leaseOwner: owner,
    leaseExpiresAt: now + 180_000,
  };
  await claim.objectStore("localMailSyncStates").put(state);
  await claim.done;

  const currentWork =
    job.kind === "current" ||
    (["delta", "lookup"].includes(job.kind) &&
      !("stream" in job.request && job.request.stream === "backfill"));
  let response: LocalMailSyncResponse | undefined;
  let failed = false;
  let storagePaused = false;
  try {
    const downloadsBody = [
      "history-hydrate",
      "folder-backfill",
      "message-lookup",
    ].includes(job.request.phase);
    if (
      (downloadsBody || job.kind === "window") &&
      !(await options.admitBackfill())
    ) {
      storagePaused = true;
      response = { status: "paused", retryAfterMs: 60_000 };
    } else if (job.kind !== "sweep") {
      response = await callWithDeadline(
        options.call ?? callServer,
        emailAccountId,
        job.request,
      );
    }
  } catch {
    failed = true;
  }

  try {
    return await options.withStorageLock(async () => {
      let maxCanonicalBytes = 0;
      if (response?.status === "ok") {
        const admission = await options.admitResponse(response);
        if (
          !Number.isFinite(admission.maxCanonicalBytes) ||
          admission.maxCanonicalBytes < 0
        )
          throw new Error("Invalid local mail storage budget");
        maxCanonicalBytes = admission.maxCanonicalBytes;
        if (!admission.allowed) {
          storagePaused = true;
          response = { status: "paused", retryAfterMs: 60_000 };
        }
      }
      const commit = database.transaction(stores, "readwrite");
      const completedAt = options.now === undefined ? Date.now() : now;
      const [current, currentAccount] = await Promise.all([
        commit.objectStore("localMailSyncStates").get(emailAccountId),
        commit.objectStore("searchIndexAccounts").get(emailAccountId),
      ]);
      if (
        !current ||
        current.leaseOwner !== owner ||
        current.fence !== state.fence ||
        (current.leaseExpiresAt ?? 0) <= completedAt ||
        currentAccount?.generation !== state.generation ||
        !isMailSyncActivated(emailAccountId) ||
        !isEmailCacheEpochCurrent(emailAccountId, epoch)
      ) {
        await commit.done;
        return { status: "stale" as const };
      }
      current.leaseOwner = undefined;
      current.leaseExpiresAt = undefined;
      const bytesBefore = (
        await commit.objectStore("searchIndexAccounts").getAll()
      ).reduce((bytes, entry) => bytes + (entry.messageBytes ?? 0), 0);
      try {
        if (failed) {
          job.attempts += 1;
          job.nextAttemptAt =
            completedAt +
            Math.min(300_000, 1000 * 2 ** Math.min(job.attempts, 8));
          await commit.objectStore("localMailSyncJobs").put(job);
        } else if (response?.status === "paused") {
          job.nextAttemptAt =
            completedAt + Math.max(1000, response.retryAfterMs);
          current.storagePaused = storagePaused || current.storagePaused;
          if (!storagePaused) current.nextAttemptAt = job.nextAttemptAt;
          await commit.objectStore("localMailSyncJobs").put(job);
        } else if (response?.status === "unsupported") {
          current.unsupported = true;
        } else if (job.kind === "sweep") {
          await sweepLocalMailSyncWindow(commit, current, job, completedAt);
        } else if (response) {
          current.storagePaused = false;
          current.lastSyncedAt = completedAt;
          await applyLocalMailSyncResponse(
            commit,
            current,
            job,
            response,
            now,
            completedAt,
          );
        }
        const accounts = await commit
          .objectStore("searchIndexAccounts")
          .getAll();
        const bytesAfter = accounts.reduce(
          (bytes, entry) => bytes + (entry.messageBytes ?? 0),
          0,
        );
        if (bytesAfter > maxCanonicalBytes && bytesAfter > bytesBefore) {
          commit.abort();
          await commit.done.catch(() => undefined);
          const pause = database.transaction(
            ["localMailSyncStates", "localMailSyncJobs", "searchIndexAccounts"],
            "readwrite",
          );
          const unchanged = await pause
            .objectStore("localMailSyncStates")
            .get(emailAccountId);
          const source = await pause
            .objectStore("searchIndexAccounts")
            .get(emailAccountId);
          const pending = await pause
            .objectStore("localMailSyncJobs")
            .get([emailAccountId, job.id]);
          if (
            unchanged?.leaseOwner === owner &&
            unchanged.fence === state.fence &&
            source?.generation === state.generation &&
            (unchanged.leaseExpiresAt ?? 0) > completedAt &&
            pending &&
            isEmailCacheEpochCurrent(emailAccountId, epoch) &&
            isMailSyncActivated(emailAccountId)
          ) {
            unchanged.leaseOwner = undefined;
            unchanged.leaseExpiresAt = undefined;
            unchanged.storagePaused = true;
            pending.nextAttemptAt = completedAt + 60_000;
            await pause.objectStore("localMailSyncStates").put(unchanged);
            await pause.objectStore("localMailSyncJobs").put(pending);
          }
          await pause.done;
          notifyEmailCacheChange(emailAccountId);
          return {
            status: "storage-paused" as const,
            retryAt: completedAt + 60_000,
          };
        }
        await commit.objectStore("localMailSyncStates").put(current);
        await commit.done;
        notifyEmailCacheChange(emailAccountId);
      } catch (error) {
        try {
          commit.abort();
        } catch {
          /* The transaction may already be aborted by IndexedDB. */
        }
        await commit.done.catch(() => undefined);
        throw error;
      }
      const newMail = currentWork
        ? getNewMailNotifications(response, job.kind)
        : [];
      return {
        status: failed ? ("retry" as const) : ("progress" as const),
        phase: job.request.phase,
        ...(newMail.length ? { newMail } : {}),
        ...(response?.status === "ok" && currentWork
          ? { currentUpdate: true }
          : {}),
      };
    });
  } catch {
    const release = database.transaction(
      ["localMailSyncStates", "localMailSyncJobs", "searchIndexAccounts"],
      "readwrite",
    );
    const current = await release
      .objectStore("localMailSyncStates")
      .get(emailAccountId);
    const source = await release
      .objectStore("searchIndexAccounts")
      .get(emailAccountId);
    const pending = await release
      .objectStore("localMailSyncJobs")
      .get([emailAccountId, job.id]);
    if (
      current?.leaseOwner === owner &&
      current.fence === state.fence &&
      source?.generation === state.generation &&
      pending &&
      isEmailCacheEpochCurrent(emailAccountId, epoch) &&
      isMailSyncActivated(emailAccountId)
    ) {
      current.leaseOwner = undefined;
      current.leaseExpiresAt = undefined;
      pending.attempts += 1;
      pending.nextAttemptAt = (options.now ?? Date.now()) + 5000;
      await release.objectStore("localMailSyncStates").put(current);
      await release.objectStore("localMailSyncJobs").put(pending);
    }
    await release.done;
    return {
      status: "retry" as const,
      retryAt: (options.now ?? Date.now()) + 5000,
    };
  }
}

export async function readLocalMailSyncState(emailAccountId: string) {
  return (await getEmailCacheDatabase())?.get(
    "localMailSyncStates",
    emailAccountId,
  );
}

async function withLocalMailSyncLock<T>(
  emailAccountId: string,
  run: () => Promise<T>,
) {
  return navigator.locks.request(
    `inbox-zero:local-mail-sync:${emailAccountId}`,
    { ifAvailable: true },
    (lock) => (lock ? run() : undefined),
  );
}

async function callServer(
  emailAccountId: string,
  request: LocalMailSyncRequest,
) {
  const result = await localMailSyncAction(emailAccountId, request);
  if (!result?.data) throw new Error("Local mail sync request failed");
  return result.data;
}
async function callWithDeadline(
  call: NonNullable<Options["call"]>,
  emailAccountId: string,
  request: LocalMailSyncRequest,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      call(emailAccountId, request),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Local mail sync request timed out")),
          90_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function getNewMailNotifications(
  response: LocalMailSyncResponse | undefined,
  kind: string,
) {
  if (response?.status !== "ok" || !["current", "lookup"].includes(kind))
    return [];
  let messages: ParsedMessage[];
  if (response.phase === "history-hydrate") messages = response.result.messages;
  else if (
    response.phase === "message-lookup" &&
    response.result.status === "found"
  )
    messages = [response.result.message];
  else return [];
  return messages
    .filter(
      (message) =>
        message.labelIds?.includes("INBOX") &&
        message.labelIds.includes("UNREAD"),
    )
    .map((message) => ({
      id: message.id,
      receivedAt: Number(message.internalDate),
    }))
    .filter((message) => Number.isFinite(message.receivedAt));
}
