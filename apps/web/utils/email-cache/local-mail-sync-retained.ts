import type { LocalMailSyncTransaction } from "./local-mail-sync";
import {
  LOCAL_MAIL_HISTORY_AFTER,
  type LocalMailSyncJob,
  type LocalMailSyncState,
} from "./local-mail-sync-state";

export async function queueRetainedMailReconciliation(
  transaction: LocalMailSyncTransaction,
  state: LocalMailSyncState,
  before: number,
) {
  const job: LocalMailSyncJob = {
    emailAccountId: state.emailAccountId,
    id: "retained-reconciliation",
    kind: "retained",
    priority: -1,
    nextAttemptAt: before,
    attempts: 0,
    request: {
      phase: "history-hydrate",
      after: LOCAL_MAIL_HISTORY_AFTER,
      messageIds: [],
      stream: "changes",
    },
    retainedScope: { after: state.retainedAfter, before, part: "older" },
  };
  await advanceRetainedMailReconciliation(transaction, job, before);
}

export async function advanceRetainedMailReconciliation(
  transaction: LocalMailSyncTransaction,
  job: LocalMailSyncJob,
  now: number,
) {
  const scope = job.retainedScope;
  if (!scope) throw new Error("Missing retained reconciliation scope");
  const messages = transaction
    .objectStore("localMailMessages")
    .index("byAccountReceivedAt");
  const ids: string[] = [];
  for (;;) {
    if (scope.part === "older" && scope.after <= LOCAL_MAIL_HISTORY_AFTER) {
      scope.part = "future";
      job.sweepAfter = undefined;
    }
    const lower =
      scope.part === "older" ? LOCAL_MAIL_HISTORY_AFTER : scope.before;
    const upper = scope.part === "older" ? scope.after : 8_640_000_000_000_000;
    let cursor = await messages.openKeyCursor(
      IDBKeyRange.bound(
        [job.emailAccountId, job.sweepAfter?.receivedAt ?? lower],
        [job.emailAccountId, upper],
        false,
        scope.part === "older",
      ),
    );
    if (cursor && job.sweepAfter) {
      if (
        cursor.key[1] === job.sweepAfter.receivedAt &&
        cursor.primaryKey[1] < job.sweepAfter.messageId
      )
        cursor = await cursor.continuePrimaryKey(
          [job.emailAccountId, job.sweepAfter.receivedAt],
          [job.emailAccountId, job.sweepAfter.messageId],
        );
      if (cursor?.primaryKey[1] === job.sweepAfter.messageId)
        cursor = await cursor.continue();
    }
    while (cursor && ids.length < 5) {
      ids.push(cursor.primaryKey[1]);
      job.sweepAfter = {
        receivedAt: cursor.key[1],
        messageId: cursor.primaryKey[1],
      };
      cursor = await cursor.continue();
    }
    if (ids.length === 5 || scope.part === "future") break;
    scope.part = "future";
    job.sweepAfter = undefined;
  }
  const jobs = transaction.objectStore("localMailSyncJobs");
  if (!ids.length) {
    await jobs.delete([job.emailAccountId, job.id]);
    return;
  }
  job.request = {
    phase: "history-hydrate",
    after: LOCAL_MAIL_HISTORY_AFTER,
    messageIds: ids,
    stream: "changes",
  };
  job.nextAttemptAt = now;
  job.attempts = 0;
  await jobs.put(job);
}
