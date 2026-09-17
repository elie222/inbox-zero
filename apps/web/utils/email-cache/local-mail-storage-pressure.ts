import { createAccountedMailTransaction } from "./optional-cache-write";
import {
  getEmailCacheDatabase,
  captureEmailCacheEpoch,
  isEmailCacheEpochCurrent,
} from "./database";
import { isMailSyncActivated } from "./mail-activation";
import {
  beginLocalMailEviction,
  runLocalMailEvictionBatch,
} from "./local-mail-retention";
import {
  readLocalMailStorageAdmission,
  withLocalMailStorageLock,
} from "./local-mail-storage";
import { reclaimSearchIndexStorage } from "./search-index-service";
import { EMAIL_CACHE_MAILBOX_MAX_AGE_MS } from "./policy";

const DAY = 24 * 60 * 60 * 1000;

export async function relieveLocalMailStoragePressure({
  emailAccountIds,
  now = Date.now(),
}: {
  emailAccountIds: string[];
  now?: number;
}) {
  const database = await getEmailCacheDatabase();
  if (!database) return "unavailable";
  const activeIds = emailAccountIds.filter(isMailSyncActivated);
  const pending = (await database.getAll("localMailEvictionJobs"))
    .filter(
      (job) =>
        job.kind !== "clear-downloads" &&
        activeIds.includes(job.emailAccountId),
    )
    .sort(
      (a, b) =>
        a.startedAt - b.startedAt ||
        a.emailAccountId.localeCompare(b.emailAccountId),
    )[0];
  if (pending) {
    let admission = await readLocalMailStorageAdmission();
    if (admission.reason === "storage-unavailable") return "unavailable";
    const scope = {
      emailAccountId: pending.emailAccountId,
      generation: pending.generation,
    };
    if (pending.stage === "remove-source") {
      await runLocalMailEvictionBatch({
        ...scope,
        revision: pending.revision,
        now,
      });
      return "progress";
    }
    if (pending.removedBytes > 0) {
      const reclaimed = await reclaimSearchIndexStorage(scope);
      if (reclaimed.status !== "ready") return "waiting-index";
      admission = await readLocalMailStorageAdmission();
      if (admission.reason === "storage-unavailable") return "unavailable";
      // Wait for physical reclamation before deleting another retained slice.
      if (!admission.allowed && !reclaimed.storage.incrementalVacuum)
        return "waiting-space";
      if (
        !admission.allowed &&
        reclaimed.storage.incrementalVacuum &&
        reclaimed.storage.afterBytes < reclaimed.storage.beforeBytes &&
        reclaimed.storage.reusableBytes > 0
      )
        return "progress";
    }
    const epoch = captureEmailCacheEpoch(scope.emailAccountId);
    await withLocalMailStorageLock(async () => {
      const tx = await createAccountedMailTransaction(database, [
        "searchIndexAccounts",
        "localMailEvictionJobs",
        "searchIndexWork",
        "localMailRetentionPolicies",
      ]);
      const account = await tx
        .objectStore("searchIndexAccounts")
        .get(scope.emailAccountId);
      const job = await tx
        .objectStore("localMailEvictionJobs")
        .get(scope.emailAccountId);
      const work = await tx
        .objectStore("searchIndexWork")
        .index("byAccount")
        .getKey(scope.emailAccountId);
      if (
        account?.generation === scope.generation &&
        account.retentionRevision === pending.revision &&
        job?.revision === pending.revision &&
        job.stage === "drain-index" &&
        (!work || pending.removedBytes === 0) &&
        isEmailCacheEpochCurrent(scope.emailAccountId, epoch)
      ) {
        if (pending.kind === "exceptions") {
          const policies = tx.objectStore("localMailRetentionPolicies");
          const policy = await policies.get(scope.emailAccountId);
          if (
            policy?.generation === scope.generation &&
            policy.revision === pending.revision
          )
            await policies.put({
              ...policy,
              exceptionSweepAfter: now + 60_000,
            });
        }
        await tx
          .objectStore("localMailEvictionJobs")
          .delete(scope.emailAccountId);
      }
      await tx.done;
    });
    return admission.allowed ? "available" : "progress";
  }
  const admission = await readLocalMailStorageAdmission();
  if (admission.allowed) return "available";
  if (admission.reason === "storage-unavailable") return "unavailable";
  const recentAfter = now - EMAIL_CACHE_MAILBOX_MAX_AGE_MS;
  const candidates = [];
  for (const emailAccountId of activeIds) {
    const state = await database.get("localMailSyncStates", emailAccountId);
    const account = await database.get("searchIndexAccounts", emailAccountId);
    if (
      !state ||
      state.recovering ||
      account?.generation !== state.generation ||
      account.seed ||
      Object.values(state.folders).some((folder) => folder.recovering)
    )
      continue;
    const policy = await database.get(
      "localMailRetentionPolicies",
      emailAccountId,
    );
    const floor =
      policy?.generation === state.generation
        ? Math.min(
            recentAfter,
            Math.max(policy.requestedAfter, policy.automaticAfter),
          )
        : undefined;
    if (floor !== undefined && (policy?.exceptionSweepAfter ?? 0) <= now) {
      const exception = await database.getFromIndex(
        "localMailMessages",
        "byAccountReceivedAt",
        IDBKeyRange.bound(
          [emailAccountId, -Number.MAX_SAFE_INTEGER],
          [emailAccountId, floor],
          false,
          true,
        ),
      );
      if (exception)
        candidates.push({
          emailAccountId,
          generation: state.generation,
          kind: "exceptions" as const,
          after: exception.receivedAt,
          before: floor,
          oldest: exception.receivedAt,
        });
    }
    if (!state.coverage || state.coverage.after >= recentAfter) continue;
    const oldest = await database.getFromIndex(
      "localMailMessages",
      "byAccountReceivedAt",
      IDBKeyRange.bound(
        [emailAccountId, state.coverage.after],
        [emailAccountId, Math.min(recentAfter, state.coverage.before)],
        false,
        true,
      ),
    );
    if (!oldest) continue;
    candidates.push({
      emailAccountId,
      generation: state.generation,
      after: state.coverage.after,
      before: Math.min(
        oldest.receivedAt + 30 * DAY,
        recentAfter,
        state.coverage.before,
      ),
      oldest: oldest.receivedAt,
    });
  }
  candidates.sort(
    (a, b) =>
      a.oldest - b.oldest || a.emailAccountId.localeCompare(b.emailAccountId),
  );
  const candidate = candidates[0];
  if (!candidate) return "protected";
  const started = await beginLocalMailEviction({
    ...candidate,
    automatic: { emailAccountIds: activeIds },
    now,
    protectedRecentAfter: recentAfter,
    protectedFetchedAfter: now - DAY,
  });
  return started ? "progress" : "waiting-space";
}
