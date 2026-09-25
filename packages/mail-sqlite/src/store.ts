import { hashCanonical } from "@inboxzero/mail-core/canonical";
import type { HostRuntime } from "@inboxzero/mail-core/ports/runtime";
import type {
  Admission,
  SubmitConversationCommand,
  SubmitMetadataCommand,
} from "@inboxzero/mail-core/commands";
import {
  draftContentSchema,
  type DraftSaveResult,
  type SaveDraft,
} from "@inboxzero/mail-core/drafts";
import {
  applyMetadataChange,
  applyMetadataPatch,
  deriveEffectiveMessage,
  type ConfirmedMessage,
} from "@inboxzero/mail-core/effective-state";
import type {
  ConversationKey,
  LocalRevision,
  MessageKey,
} from "@inboxzero/mail-core/identities";
import { blobIdSchema } from "@inboxzero/mail-core/identities";
import {
  messageAttachmentDescriptorSchema,
  type MessageAttachmentDescriptor,
  type MessageMetadata,
} from "@inboxzero/mail-core/messages";
import {
  DEFERRED_DISPATCH_MIN_HOLD_MS,
  isPendingEffectStatus,
  type OperationState,
  type PreparedOperation,
  type TargetOutcome,
} from "@inboxzero/mail-core/operations";
import type {
  MailStore,
  MailStoreInspectionInput,
  MailStoreInspection,
  ClaimedWork,
} from "@inboxzero/mail-core/ports/mail-store";
import type {
  BodyObservation,
  ProviderChange,
  SyncPage,
} from "@inboxzero/mail-core/sync";
import type { SqlTransaction, SqliteDriver } from "./driver";
import {
  evictReplaceableMessageContent,
  listReferencedBlobIds,
} from "./maintenance";
import {
  readMailboxCountsFromSql,
  readMailboxViewFromSql,
  readMailboxWindowFromSql,
} from "./mailbox-view-readers";
import { migrateMailbox } from "./migrations";
import {
  deleteAccountSearchIndex,
  indexMessageContent,
  indexSearchBacklog,
} from "./message-search-index";
import { probeSqliteCapabilities } from "./capabilities";
import {
  connectionStatus,
  metadataFromEffective,
  readCoverage,
  readRevision,
} from "./store-read-utils";

const MAX_QUEUE = 5000;
const PENDING_STATUSES = [
  "preparing",
  "queued",
  "executing",
  "verifying",
  "retry_wait",
  "blocked_auth",
  "uncertain",
  "needs_attention",
];
const HYDRATION_JOB_KEY_LIMIT = 20;

export type SqliteMailStoreOptions = {
  maxPendingOperations?: number;
  runtime?: Pick<HostRuntime, "randomId" | "sha256" | "nowMs">;
};

export async function createSqliteMailStore(
  driver: SqliteDriver,
  options: SqliteMailStoreOptions = {},
): Promise<MailStore> {
  const maxPendingOperations = clampMaxPendingOperations(
    options.maxPendingOperations,
  );
  const runtime = resolveStoreRuntime(options.runtime);
  const digest = (value: unknown) => hashCanonical(value, runtime.sha256);
  await driver.write(async (tx) => {
    await migrateMailbox(tx, runtime.randomId());
  });
  const capabilities = await probeSqliteCapabilities(driver);
  if (!capabilities.savepoints) {
    throw new Error("SQLite savepoints are required for mailbox migrations");
  }
  if (!capabilities.jsonEach) {
    throw new Error("SQLite json_each is required for mailbox queries");
  }
  // Each open walks the bodies once, so rows missed while the index was
  // rebuilt or unavailable are indexed without a durable cursor.
  let searchBacklog: { after: MessageKey | null } | null = capabilities.fts5
    ? { after: null }
    : null;

  const store: MailStore = {
    async ensureAccount(input) {
      return driver.write(async (tx) => {
        const existing = await tx.query(
          "SELECT generation FROM accounts WHERE account_id = ?",
          [input.accountId],
        );
        if (existing.length === 0) {
          await tx.execute(
            "INSERT INTO accounts(account_id, provider, generation, assistant_cursor) VALUES (?, ?, ?, NULL)",
            [input.accountId, input.provider, input.generation],
          );
        } else if (existing[0].generation !== input.generation) {
          await resetAccountForGeneration(tx, input);
        } else {
          await tx.execute(
            "UPDATE accounts SET provider = ? WHERE account_id = ?",
            [input.provider, input.accountId],
          );
        }
        return bumpRevision(tx);
      });
    },
    evictReplaceableContent() {
      return evictReplaceableMessageContent(driver);
    },
    async indexSearchBacklog() {
      if (!searchBacklog) return { remaining: false };
      const { after } = searchBacklog;
      const last = await driver.write((tx) => indexSearchBacklog(tx, after));
      searchBacklog = last ? { after: last } : null;
      return { remaining: last !== null };
    },
    async purgeAccount(accountId) {
      return driver.write(async (tx) => {
        await deleteAccountSearchIndex(tx, accountId);
        const existing = await tx.query(
          "SELECT 1 AS n FROM accounts WHERE account_id = ?",
          [accountId],
        );
        if (existing.length === 0) return readRevision(tx);
        const tables = [
          "message_content",
          "effective_messages",
          "operation_targets",
          "operation_conversations",
          "operations",
          "draft_attachments",
          "drafts",
          "sync_streams",
          "bootstrap_seen_messages",
          "bootstrap_existing_messages",
          "bootstrap_scans",
          "coverage",
          "sync_jobs",
          "conversation_completeness",
          "assistant_entries",
          "messages",
          "accounts",
        ];
        for (const table of tables) {
          await tx.execute(`DELETE FROM ${table} WHERE account_id = ?`, [
            accountId,
          ]);
        }
        return bumpRevision(tx);
      });
    },
    async admitMetadata(input) {
      return driver.write((tx) =>
        admitExact(tx, input, maxPendingOperations, digest),
      );
    },
    async admitConversations(input) {
      return driver.write((tx) =>
        admitConversations(tx, input, maxPendingOperations, runtime, digest),
      );
    },
    async applyPreparationPage(input) {
      return driver.write(async (tx) => {
        const operation = await loadOperation(
          tx,
          input.accountId,
          input.commandId,
        );
        if (operation?.status !== "preparing") return { status: "stale" };
        if (operation.attempt_id !== input.attemptId) {
          return { status: "stale" };
        }
        if (!(await accountGenerationMatches(tx, input.session))) {
          return { status: "stale" };
        }
        if (input.page.conversation.accountId !== input.accountId) {
          return { status: "stale" };
        }
        if (input.page.resolutionId.length === 0) {
          return { status: "stale" };
        }
        const preparation = await tx.query(
          `SELECT resolution_id, next_page, complete
           FROM operation_conversations
           WHERE account_id = ? AND command_id = ? AND conversation_id = ?`,
          [
            input.accountId,
            input.commandId,
            input.page.conversation.conversationId,
          ],
        );
        if (
          !preparation[0] ||
          Number(preparation[0].complete) === 1 ||
          String(preparation[0].resolution_id) !== input.page.resolutionId ||
          nullableString(preparation[0].next_page) !== input.previousPage
        ) {
          return { status: "stale" };
        }
        if (
          input.page.changes.some(
            (change) =>
              !providerChangeBelongsToAccount(change, input.accountId),
          )
        ) {
          return { status: "stale" };
        }
        for (const change of input.page.changes) {
          await applyChange(tx, change);
        }
        for (const key of input.page.keys) {
          if (key.accountId !== input.accountId) continue;
          await tx.execute(
            `INSERT OR IGNORE INTO operation_targets(account_id, command_id, message_id, conversation_id)
             VALUES (?, ?, ?, ?)`,
            [
              input.accountId,
              input.commandId,
              key.messageId,
              input.page.conversation.conversationId,
            ],
          );
        }
        const updated = await tx.execute(
          `UPDATE operation_conversations
           SET next_page = ?, complete = ?
           WHERE account_id = ? AND command_id = ? AND conversation_id = ?
             AND resolution_id = ?
             AND complete = 0
             AND ((next_page IS NULL AND ? IS NULL) OR next_page = ?)`,
          [
            input.page.nextPage,
            input.page.nextPage ? 0 : 1,
            input.accountId,
            input.commandId,
            input.page.conversation.conversationId,
            input.page.resolutionId,
            input.previousPage,
            input.previousPage,
          ],
        );
        if (updated.changedRows === 0) return { status: "stale" };
        if (!input.page.nextPage) {
          await tx.execute(
            `INSERT INTO conversation_completeness(account_id, conversation_id, complete)
             VALUES (?, ?, 1)
             ON CONFLICT(account_id, conversation_id) DO UPDATE SET complete = 1`,
            [input.accountId, input.page.conversation.conversationId],
          );
        }
        await tx.execute(
          `UPDATE operations
           SET claimed_by = NULL, claimed_until_ms = NULL, attempt_id = NULL, next_attempt_at_ms = NULL
           WHERE account_id = ? AND command_id = ? AND status = 'preparing' AND attempt_id = ?`,
          [input.accountId, input.commandId, input.attemptId],
        );
        const revision = await bumpRevision(tx);
        return {
          status: "preparing",
          operation: {
            accountId: input.accountId,
            operationId: input.commandId,
          },
          revision,
        };
      });
    },
    async finishPreparation(input) {
      return driver.write(async (tx) => {
        const remaining = await tx.query(
          `SELECT conversation_id FROM operation_conversations
           WHERE account_id = ? AND command_id = ? AND complete = 0`,
          [input.accountId, input.commandId],
        );
        if (remaining.length > 0) return { status: "stale" };
        const operation = await loadOperation(
          tx,
          input.accountId,
          input.commandId,
        );
        if (operation?.status !== "preparing") return { status: "stale" };
        const payload = JSON.parse(String(operation.payload_json)) as {
          change: SubmitMetadataCommand["change"];
        };
        const targets = await tx.query(
          `SELECT message_id, conversation_id FROM operation_targets
           WHERE account_id = ? AND command_id = ?`,
          [input.accountId, input.commandId],
        );
        const messageTargets = targets.map((row) => ({
          accountId: input.accountId,
          messageId: String(row.message_id),
        }));
        const executable = {
          kind: "metadata" as const,
          targets: messageTargets,
          change: payload.change,
        };
        const executableHash = await digest(executable);
        await tx.execute(
          `UPDATE operations SET status = 'queued', executable_hash = ?, executable_payload_json = ?
           WHERE account_id = ? AND command_id = ?`,
          [
            executableHash,
            JSON.stringify(executable),
            input.accountId,
            input.commandId,
          ],
        );
        await recomputeTargets(tx, messageTargets);
        const revision = await bumpRevision(tx);
        return {
          status: "queued" as const,
          operation: {
            accountId: input.accountId,
            operationId: input.commandId,
          },
          revision,
        };
      });
    },
    async claimWork(input) {
      return driver.write(async (tx) => {
        const preparing = await tx.query(
          `SELECT o.account_id, o.command_id, c.conversation_id, c.resolution_id, c.next_page, a.generation
           FROM operations o
           JOIN operation_conversations c
             ON c.account_id = o.account_id AND c.command_id = o.command_id
           JOIN accounts a
             ON a.account_id = o.account_id
           WHERE o.status = 'preparing' AND c.complete = 0
             AND (o.next_attempt_at_ms IS NULL OR o.next_attempt_at_ms <= ?)
             AND (o.claimed_by IS NULL OR o.claimed_until_ms IS NULL OR o.claimed_until_ms < ?)
           ORDER BY o.created_at_ms, c.conversation_id
           LIMIT 1`,
          [input.nowMs, input.nowMs],
        );
        if (preparing[0]) {
          const attemptId = runtime.randomId();
          const claimed = await tx.execute(
            `UPDATE operations
             SET attempts = attempts + 1, claimed_by = ?, claimed_until_ms = ?, attempt_id = ?
             WHERE account_id = ? AND command_id = ?
               AND status = 'preparing'
               AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)
               AND (claimed_by IS NULL OR claimed_until_ms IS NULL OR claimed_until_ms < ?)`,
            [
              input.ownerId,
              input.nowMs + input.leaseMs,
              attemptId,
              preparing[0].account_id,
              preparing[0].command_id,
              input.nowMs,
              input.nowMs,
            ],
          );
          if (claimed.changedRows === 0) return null;
          return {
            kind: "prepare" as const,
            attemptId,
            commandId: String(preparing[0].command_id),
            accountId: String(preparing[0].account_id),
            session: {
              accountId: String(preparing[0].account_id),
              generation: String(preparing[0].generation),
            },
            conversation: {
              accountId: String(preparing[0].account_id),
              conversationId: String(preparing[0].conversation_id),
            },
            resolutionId: String(preparing[0].resolution_id),
            page: preparing[0].next_page
              ? String(preparing[0].next_page)
              : null,
          };
        }
        const upload = await claimUploadWork(tx, input, runtime.randomId);
        if (upload) return upload;
        const queued = await tx.query(
          `SELECT * FROM operations
           WHERE executable_hash IS NOT NULL
             AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)
             AND (claimed_by IS NULL OR claimed_until_ms IS NULL OR claimed_until_ms < ?)
             AND (
               status IN ('queued', 'retry_wait')
               OR status = 'executing'
             )
           ORDER BY created_at_ms`,
          [input.nowMs, input.nowMs],
        );
        for (const row of queued) {
          if (await hasUnsatisfiedDependency(tx, row)) continue;
          const attemptId = runtime.randomId();
          const claimed = await tx.execute(
            `UPDATE operations
             SET status = 'executing', attempts = attempts + 1, claimed_by = ?, claimed_until_ms = ?, attempt_id = ?
             WHERE account_id = ? AND command_id = ?
               AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)
               AND (claimed_by IS NULL OR claimed_until_ms IS NULL OR claimed_until_ms < ?)
               AND status IN ('queued', 'retry_wait', 'executing')`,
            [
              input.ownerId,
              input.nowMs + input.leaseMs,
              attemptId,
              row.account_id,
              row.command_id,
              input.nowMs,
              input.nowMs,
            ],
          );
          if (claimed.changedRows === 0) continue;
          const prepared = await toPrepared(tx, row);
          if (!prepared) return null;
          return { kind: "command" as const, attemptId, operation: prepared };
        }
        const inspectable = await tx.query(
          `SELECT * FROM operations
           WHERE status IN ('uncertain', 'verifying')
             AND executable_hash IS NOT NULL
             AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)
             AND (claimed_by IS NULL OR claimed_until_ms IS NULL OR claimed_until_ms < ?)
           ORDER BY created_at_ms`,
          [input.nowMs, input.nowMs],
        );
        for (const row of inspectable) {
          if (await hasUnsatisfiedDependency(tx, row)) continue;
          const attemptId = runtime.randomId();
          const claimed = await tx.execute(
            `UPDATE operations
             SET claimed_by = ?, claimed_until_ms = ?, attempt_id = ?
             WHERE account_id = ? AND command_id = ?
               AND status IN ('uncertain', 'verifying')
               AND executable_hash IS NOT NULL
               AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)
               AND (claimed_by IS NULL OR claimed_until_ms IS NULL OR claimed_until_ms < ?)`,
            [
              input.ownerId,
              input.nowMs + input.leaseMs,
              attemptId,
              row.account_id,
              row.command_id,
              input.nowMs,
              input.nowMs,
            ],
          );
          if (claimed.changedRows === 0) continue;
          const prepared = await toPrepared(tx, row);
          if (!prepared) return null;
          return {
            kind: "inspect" as const,
            attemptId,
            receiptId: row.receipt_id == null ? null : String(row.receipt_id),
            operation: prepared,
          };
        }
        const hydrate = await tx.query(
          `SELECT j.*, a.generation
           FROM sync_jobs j
           JOIN accounts a ON a.account_id = j.account_id
           WHERE j.kind = 'hydrate'
             AND (j.retry_at_ms IS NULL OR j.retry_at_ms <= ?)
             AND (j.claimed_by IS NULL OR j.claimed_until_ms < ?)
           LIMIT 1`,
          [input.nowMs, input.nowMs],
        );
        if (hydrate[0]) {
          const attemptId = runtime.randomId();
          const claimed = await tx.execute(
            `UPDATE sync_jobs SET claimed_by = ?, claimed_until_ms = ?, attempt_id = ?
             WHERE job_id = ?
               AND (retry_at_ms IS NULL OR retry_at_ms <= ?)
               AND (claimed_by IS NULL OR claimed_until_ms < ?)`,
            [
              input.ownerId,
              input.nowMs + input.leaseMs,
              attemptId,
              hydrate[0].job_id,
              input.nowMs,
              input.nowMs,
            ],
          );
          if (claimed.changedRows > 0) {
            const payload = JSON.parse(String(hydrate[0].payload_json)) as {
              keys: MessageKey[];
              purpose: "metadata" | "body";
            };
            return {
              kind: "hydrate" as const,
              jobId: String(hydrate[0].job_id),
              attemptId,
              session: {
                accountId: String(hydrate[0].account_id),
                generation: String(hydrate[0].generation),
              },
              keys: payload.keys,
              purpose: payload.purpose,
            };
          }
        }
        const search = await tx.query(
          `SELECT j.*, a.generation
           FROM sync_jobs j
           JOIN accounts a ON a.account_id = j.account_id
           WHERE j.kind = 'search'
             AND (j.retry_at_ms IS NULL OR j.retry_at_ms <= ?)
             AND (j.claimed_by IS NULL OR j.claimed_until_ms < ?)
           LIMIT 1`,
          [input.nowMs, input.nowMs],
        );
        if (search[0]) {
          const attemptId = runtime.randomId();
          const claimed = await tx.execute(
            `UPDATE sync_jobs SET claimed_by = ?, claimed_until_ms = ?, attempt_id = ?
             WHERE job_id = ?
               AND (retry_at_ms IS NULL OR retry_at_ms <= ?)
               AND (claimed_by IS NULL OR claimed_until_ms < ?)`,
            [
              input.ownerId,
              input.nowMs + input.leaseMs,
              attemptId,
              search[0].job_id,
              input.nowMs,
              input.nowMs,
            ],
          );
          if (claimed.changedRows > 0) {
            const payload = JSON.parse(String(search[0].payload_json)) as {
              predicate: import("@inboxzero/mail-core/queries").MailPredicate;
              page: string | null;
            };
            return {
              kind: "search" as const,
              jobId: String(search[0].job_id),
              attemptId,
              accountId: String(search[0].account_id),
              session: {
                accountId: String(search[0].account_id),
                generation: String(search[0].generation),
              },
              predicate: payload.predicate,
              page: payload.page,
            };
          }
        }
        return null;
      });
    },
    async releaseDeferredOperations(input) {
      if (input.accountIds.length === 0) return;
      await driver.write(async (tx) => {
        await tx.execute(
          `UPDATE operations
           SET next_attempt_at_ms = NULL
           WHERE status IN ('queued', 'retry_wait')
             AND next_attempt_at_ms IS NOT NULL
             AND next_attempt_at_ms > ?
             AND account_id IN (${input.accountIds.map(() => "?").join(",")})`,
          [input.nowMs + DEFERRED_DISPATCH_MIN_HOLD_MS, ...input.accountIds],
        );
      });
    },
    async applySyncPage(input) {
      return driver.write(async (tx) => {
        const account = await tx.query(
          "SELECT generation FROM accounts WHERE account_id = ?",
          [input.page.session.accountId],
        );
        if (
          !account[0] ||
          account[0].generation !== input.page.session.generation ||
          input.page.from.streamId !== input.page.to.streamId ||
          input.page.from.generation !== input.page.session.generation
        ) {
          return { status: "stale" };
        }
        const stream = await tx.query(
          "SELECT generation, checkpoint FROM sync_streams WHERE account_id = ? AND stream_id = ?",
          [input.page.session.accountId, input.page.from.streamId],
        );
        if (stream[0]) {
          if (
            String(stream[0].generation) !== input.page.from.generation ||
            nullableString(stream[0].checkpoint) !== input.page.from.checkpoint
          ) {
            return { status: "stale" };
          }
        } else if (input.page.from.checkpoint !== null) {
          return { status: "stale" };
        }
        const bodies = input.bodies ?? input.page.bodies ?? [];
        if (
          !pageFactsBelongToAccount(
            input.page.session.accountId,
            input.page.changes,
            input.page.requiredHydration,
            bodies,
          )
        ) {
          return { status: "stale" };
        }
        await applyPageFacts(tx, {
          accountId: input.page.session.accountId,
          requestId: input.page.requestId,
          changes: input.page.changes,
          requiredHydration: input.page.requiredHydration,
          bodies,
          digest,
        });
        await tx.execute(
          `INSERT INTO sync_streams(account_id, stream_id, generation, checkpoint)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(account_id, stream_id) DO UPDATE SET generation = excluded.generation, checkpoint = excluded.checkpoint`,
          [
            input.page.session.accountId,
            input.page.to.streamId,
            input.page.to.generation,
            input.page.to.checkpoint,
          ],
        );
        if (input.page.roundComplete) {
          await tx.execute(
            `INSERT INTO coverage(account_id, scope_id, metadata, content, indexed_content, last_completed_sync_at_ms)
             VALUES (?, ?, 'complete', 'partial', 'partial', ?)
             ON CONFLICT(account_id, scope_id) DO UPDATE SET
               metadata = 'complete',
               last_completed_sync_at_ms = excluded.last_completed_sync_at_ms`,
            [input.page.session.accountId, input.page.to.streamId, Date.now()],
          );
        }
        const revision = await bumpRevision(tx);
        return { status: "committed", revision };
      });
    },
    async applyHydration(input) {
      return driver.write(async (tx) => {
        if (!(await accountGenerationMatches(tx, input.session))) {
          return { status: "stale" as const };
        }
        if (
          input.attemptId &&
          !(await hydrationAttemptMatches(tx, {
            accountId: input.session.accountId,
            jobId: input.requestId,
            attemptId: input.attemptId,
          }))
        ) {
          return { status: "stale" as const };
        }
        if (
          input.changes.some(
            (change) =>
              !providerChangeBelongsToAccount(change, input.session.accountId),
          ) ||
          input.bodies.some(
            (body) => body.key.accountId !== input.session.accountId,
          )
        ) {
          return { status: "stale" as const };
        }
        let applied = 0;
        for (const change of input.changes) {
          if (
            change.kind === "message_patch" &&
            (await isStaleMessageVersion(
              tx,
              change.key,
              change.reference.version,
            ))
          ) {
            continue;
          }
          await applyChange(tx, change);
          applied += 1;
        }
        for (const body of input.bodies) {
          if (await isStaleMessageVersion(tx, body.key, body.version)) continue;
          applied += 1;
          await insertMessageContent(tx, body);
        }
        if (
          applied === 0 &&
          (input.changes.length > 0 || input.bodies.length > 0)
        ) {
          return { status: "stale" as const };
        }
        const revision = await bumpRevision(tx);
        return { status: "committed", revision };
      });
    },
    async settleAttempt(input) {
      return driver.write(async (tx) => {
        const current = await tx.query(
          "SELECT * FROM operations WHERE account_id = ? AND command_id = ? AND attempt_id = ?",
          [
            input.operation.key.accountId,
            input.operation.key.operationId,
            input.attemptId,
          ],
        );
        if (!current[0]) return { status: "stale" };
        if (
          current[0].status === "succeeded" ||
          current[0].status === "failed" ||
          current[0].status === "cancelled" ||
          current[0].status === "superseded"
        ) {
          return { status: "stale" };
        }
        if (!(await accountGenerationMatches(tx, input.operation.session))) {
          return { status: "stale" };
        }
        if (input.result.status === "confirmed") {
          const targets = resolveTargetOutcomes(
            input.operation,
            input.result.targets,
            "applied",
          );
          await persistTargetOutcomes(tx, input.operation.key, targets);
          const observedKeys = new Set(
            input.result.observations.flatMap((change) => {
              const key = providerChangeKey(change);
              return key ? [`${key.accountId}:${key.messageId}`] : [];
            }),
          );
          for (const change of input.result.observations)
            await applyChange(tx, change);
          if (input.operation.intent.kind === "metadata") {
            for (const target of targets.filter(
              (item) =>
                item.outcome === "applied" &&
                !observedKeys.has(
                  `${item.key.accountId}:${item.key.messageId}`,
                ),
            )) {
              const confirmed = await loadConfirmed(tx, target.key);
              if (!confirmed) continue;
              const next = applyMetadataChange(
                confirmed,
                input.operation.intent.change,
              );
              await upsertConfirmed(tx, { ...confirmed, ...next });
            }
          }
          await tx.execute(
            `UPDATE operations SET status = ?, receipt_id = ?, claimed_by = NULL, attempt_id = NULL
             WHERE account_id = ? AND command_id = ?`,
            [
              operationStatusFromTargets(targets, "succeeded"),
              input.result.receiptId,
              input.operation.key.accountId,
              input.operation.key.operationId,
            ],
          );
        } else if (input.result.status === "rejected") {
          const targets = resolveTargetOutcomes(
            input.operation,
            input.result.targets,
            "rejected",
            input.result.code,
          );
          await persistTargetOutcomes(tx, input.operation.key, targets);
          await tx.execute(
            `UPDATE operations SET status = ?, error_code = ?, error_retryable = 0, claimed_by = NULL, attempt_id = NULL
             WHERE account_id = ? AND command_id = ?`,
            [
              operationStatusFromTargets(targets, "failed"),
              input.result.code,
              input.operation.key.accountId,
              input.operation.key.operationId,
            ],
          );
          await unfreezeSendDraft(
            tx,
            input.operation.key.accountId,
            current[0].payload_json,
            input.operation.key.operationId,
          );
        } else if (input.result.status === "uncertain") {
          const inspectable = isInspectableOperationStatus(current[0].status);
          await tx.execute(
            `UPDATE operations SET status = 'uncertain', receipt_id = COALESCE(?, receipt_id), claimed_by = NULL, claimed_until_ms = NULL, next_attempt_at_ms = ?
             WHERE account_id = ? AND command_id = ?`,
            [
              boundReceiptId(input.result.receiptId),
              inspectable ? Date.now() + 1000 : null,
              input.operation.key.accountId,
              input.operation.key.operationId,
            ],
          );
        } else if (input.result.status === "accepted") {
          await tx.execute(
            `UPDATE operations SET status = 'verifying', receipt_id = ?, next_attempt_at_ms = ?, claimed_by = NULL
             WHERE account_id = ? AND command_id = ?`,
            [
              input.result.receiptId,
              Date.now() + input.result.retryAfterMs,
              input.operation.key.accountId,
              input.operation.key.operationId,
            ],
          );
        } else if (isInspectableOperationStatus(current[0].status)) {
          await tx.execute(
            `UPDATE operations SET claimed_by = NULL, claimed_until_ms = NULL, next_attempt_at_ms = ?
             WHERE account_id = ? AND command_id = ?`,
            [
              Date.now() + (input.result.retryAfterMs ?? 1000),
              input.operation.key.accountId,
              input.operation.key.operationId,
            ],
          );
        } else if (input.result.reason === "blocked_auth") {
          await tx.execute(
            `UPDATE operations SET status = 'blocked_auth', next_attempt_at_ms = ?, claimed_by = NULL
             WHERE account_id = ? AND command_id = ?`,
            [
              Date.now() + (input.result.retryAfterMs ?? 1000),
              input.operation.key.accountId,
              input.operation.key.operationId,
            ],
          );
        } else {
          await tx.execute(
            `UPDATE operations SET status = 'retry_wait', next_attempt_at_ms = ?, claimed_by = NULL
             WHERE account_id = ? AND command_id = ?`,
            [
              Date.now() + (input.result.retryAfterMs ?? 1000),
              input.operation.key.accountId,
              input.operation.key.operationId,
            ],
          );
        }
        if (input.operation.intent.kind === "metadata") {
          await recomputeTargets(tx, input.operation.intent.targets);
        }
        const revision = await bumpRevision(tx);
        return { status: "committed", revision };
      });
    },
    async tombstoneUnseen(input) {
      return driver.write(async (tx) => {
        if (!(await accountGenerationMatches(tx, input.session))) {
          return readRevision(tx);
        }
        if (!scopeAllowsMissingDeletion(input.scopeId)) {
          return readRevision(tx);
        }
        const rows = await tx.query(
          "SELECT message_id FROM messages WHERE account_id = ? AND deleted = 0",
          [input.session.accountId],
        );
        const seen = new Set(input.seenMessageIds);
        const missing = rows.filter((row) => !seen.has(String(row.message_id)));
        for (const row of missing) {
          await applyChange(tx, {
            kind: "message_deleted",
            key: {
              accountId: input.session.accountId,
              messageId: String(row.message_id),
            },
            evidence: `bootstrap_unseen:${input.scopeId}`,
          });
        }
        return missing.length > 0 ? bumpRevision(tx) : readRevision(tx);
      });
    },
    async cancelOperation(key) {
      return driver.write(async (tx) => {
        const current = await loadOperation(tx, key.accountId, key.operationId);
        if (!current) return { status: "not_found" };
        if (current.status !== "preparing" && current.status !== "queued") {
          return { status: "too_late" };
        }
        await tx.execute(
          `UPDATE operations SET status = 'cancelled' WHERE account_id = ? AND command_id = ?`,
          [key.accountId, key.operationId],
        );
        await unfreezeSendDraft(
          tx,
          key.accountId,
          current.payload_json,
          key.operationId,
        );
        const targets = await tx.query(
          "SELECT message_id FROM operation_targets WHERE account_id = ? AND command_id = ?",
          [key.accountId, key.operationId],
        );
        await recomputeTargets(
          tx,
          targets.map((row) => ({
            accountId: key.accountId,
            messageId: String(row.message_id),
          })),
        );
        return { status: "cancelled", revision: await bumpRevision(tx) };
      });
    },
    async saveDraft(input) {
      return driver.write((tx) => saveDraftRow(tx, input));
    },
    async readDraft(key) {
      return driver.read(async (tx) => {
        const current = await tx.query(
          "SELECT revision, content_json FROM drafts WHERE account_id = ? AND draft_id = ?",
          [key.accountId, key.draftId],
        );
        if (!current[0]) return { status: "missing" as const };
        try {
          const parsed = draftContentSchema.safeParse(
            JSON.parse(String(current[0].content_json)),
          );
          if (!parsed.success) return { status: "missing" as const };
          return {
            status: "found" as const,
            draftRevision: Number(current[0].revision),
            content: parsed.data,
          };
        } catch {
          return { status: "missing" as const };
        }
      });
    },
    listReferencedBlobIds() {
      return listReferencedBlobIds(driver);
    },
    async stageDraftAttachment(input) {
      const parsed = blobIdSchema.safeParse(input.attachmentId);
      if (!parsed.success) return { status: "rejected", code: "invalid" };
      return driver.write(async (tx) => {
        await tx.execute(
          `INSERT INTO draft_attachments(
             account_id, attachment_id, draft_id, filename, content_type, size_bytes,
             checksum, inline, remote_status, created_at_ms
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?)
           ON CONFLICT(account_id, attachment_id) DO UPDATE SET
             draft_id = excluded.draft_id,
             filename = excluded.filename,
             content_type = excluded.content_type,
             size_bytes = excluded.size_bytes,
             checksum = excluded.checksum,
             inline = excluded.inline,
             remote_status = CASE
               WHEN draft_attachments.remote_status = 'uploaded' THEN draft_attachments.remote_status
               ELSE 'local'
             END`,
          [
            input.accountId,
            parsed.data,
            input.draftId,
            input.filename,
            input.contentType,
            input.sizeBytes,
            input.checksum,
            input.inline ? 1 : 0,
            runtime.nowMs(),
          ],
        );
        return { status: "staged" as const };
      });
    },
    async recordAttachmentUpload(input) {
      return driver.write(async (tx) => {
        await tx.execute(
          `UPDATE draft_attachments
           SET remote_upload_id = ?, remote_status = 'uploaded'
           WHERE account_id = ? AND attachment_id = ?`,
          [input.remoteUploadId, input.accountId, input.attachmentId],
        );
        await tx.execute(
          `UPDATE operations
           SET claimed_by = NULL, claimed_until_ms = NULL, attempt_id = NULL
           WHERE account_id = ? AND command_id = ?
             AND status IN ('queued', 'retry_wait')`,
          [input.accountId, input.operationId],
        );
        return bumpRevision(tx);
      });
    },
    async admitSend(input) {
      return driver.write(async (tx) => {
        const draft = await tx.query(
          "SELECT revision, content_json, frozen FROM drafts WHERE account_id = ? AND draft_id = ?",
          [input.draft.accountId, input.draft.draftId],
        );
        if (!draft[0] || Number(draft[0].revision) !== input.draftRevision) {
          return { status: "rejected", code: "invalid" };
        }
        const parsed = draftContentSchema.safeParse(
          JSON.parse(String(draft[0].content_json)),
        );
        if (!parsed.success) {
          return { status: "rejected", code: "invalid" };
        }
        const content = parsed.data;
        let replyToConversationId: string | null = input.conversationId ?? null;
        if (input.replyTo) {
          const replied = await tx.query(
            "SELECT conversation_id FROM messages WHERE account_id = ? AND message_id = ?",
            [input.replyTo.accountId, input.replyTo.messageId],
          );
          replyToConversationId =
            (replied[0] ? String(replied[0].conversation_id) : null) ??
            replyToConversationId;
        }
        const payload = {
          kind: "send" as const,
          frozenDraftId: input.draft.draftId,
          frozenDraftRevision: input.draftRevision,
          to: content.to,
          cc: content.cc,
          bcc: content.bcc,
          subject: content.subject,
          html: content.editableHtml,
          quotedHtml: content.quotedHtml,
          attachmentIds: content.attachmentIds,
          ...(content.providerDraftId
            ? { providerDraftId: content.providerDraftId }
            : {}),
          replyToMessageId: input.replyTo?.messageId ?? null,
          replyToConversationId,
          queuedAtMs: Date.now(),
        };
        const hash = await digest({ ...payload, queuedAtMs: 0 });
        const existing = await loadOperation(
          tx,
          input.draft.accountId,
          input.commandId,
        );
        if (existing) {
          if (String(existing.intent_hash) === hash) {
            return {
              status: "already_recorded" as const,
              operation: {
                accountId: input.draft.accountId,
                operationId: input.commandId,
              },
              revision: await readRevision(tx),
            };
          }
          return { status: "rejected" as const, code: "invalid" as const };
        }
        if (Number(draft[0].frozen) === 1) {
          return { status: "rejected" as const, code: "invalid" as const };
        }
        const full = await rejectIfQueueFull(
          tx,
          input.draft.accountId,
          maxPendingOperations,
        );
        if (full) return full;
        await tx.execute(
          "UPDATE drafts SET frozen = 1 WHERE account_id = ? AND draft_id = ?",
          [input.draft.accountId, input.draft.draftId],
        );
        await tx.execute(
          `INSERT INTO operations(
             account_id, command_id, status, authority, intent_hash, executable_hash,
             payload_json, executable_payload_json, attempts, created_at_ms,
             next_attempt_at_ms
           ) VALUES (?, ?, 'queued', 'backend', ?, ?, ?, ?, 0, ?, ?)`,
          [
            input.draft.accountId,
            input.commandId,
            hash,
            hash,
            JSON.stringify(payload),
            JSON.stringify(payload),
            Date.now(),
            input.notBeforeMs ?? null,
          ],
        );
        return {
          status: "queued" as const,
          operation: {
            accountId: input.draft.accountId,
            operationId: input.commandId,
          },
          revision: await bumpRevision(tx),
        };
      });
    },
    async readMailboxView(query) {
      return driver.read(async (tx) =>
        withIndexedCoverage(
          await readMailboxViewFromSql(tx, query),
          capabilities,
        ),
      );
    },
    async readMailboxCounts(query) {
      return driver.read((tx) => readMailboxCountsFromSql(tx, query));
    },
    async readMailboxWindow(query, pageCount) {
      return driver.read(async (tx) =>
        withIndexedCoverage(
          await readMailboxWindowFromSql(tx, query, pageCount),
          capabilities,
        ),
      );
    },
    async readConversation(key, page) {
      return driver.read(async (tx) => {
        const revision = await readRevision(tx);
        const after = page.after
          ? await tx.query(
              `SELECT received_at_ms, message_id FROM effective_messages
               WHERE account_id = ? AND conversation_id = ? AND message_id = ?`,
              [key.accountId, key.conversationId, page.after],
            )
          : [];
        const cursor = after[0]
          ? {
              receivedAtMs: Number(after[0].received_at_ms),
              messageId: String(after[0].message_id),
            }
          : null;
        const rows = await tx.query(
          `SELECT * FROM effective_messages
           WHERE account_id = ? AND conversation_id = ?
             AND (
               ? IS NULL
               OR received_at_ms > ?
               OR (received_at_ms = ? AND message_id > ?)
             )
           ORDER BY received_at_ms ASC, message_id ASC
           LIMIT ?`,
          [
            key.accountId,
            key.conversationId,
            cursor ? cursor.messageId : null,
            cursor?.receivedAtMs ?? 0,
            cursor?.receivedAtMs ?? 0,
            cursor?.messageId ?? "",
            page.pageSize + 1,
          ],
        );
        const slice = rows.slice(0, page.pageSize);
        const contents = await tx.query(
          `SELECT message_id, html, text, attachments_json, is_meeting_invitation FROM message_content WHERE account_id = ? AND message_id IN (${slice.map(() => "?").join(",") || "NULL"})`,
          [key.accountId, ...slice.map((row) => String(row.message_id))],
        );
        const contentById = new Map(
          contents.map((row) => [String(row.message_id), row]),
        );
        return {
          revision,
          view: {
            key,
            messages: slice.map((row) => {
              const content = contentById.get(String(row.message_id));
              return {
                key: {
                  accountId: String(row.account_id),
                  messageId: String(row.message_id),
                },
                metadata: metadataFromEffective(row),
                content: content
                  ? {
                      status: "available" as const,
                      html: content.html === null ? null : String(content.html),
                      text: content.text === null ? null : String(content.text),
                      attachments: parseStoredAttachments(
                        content.attachments_json,
                      ),
                      isMeetingInvitation:
                        Number(content.is_meeting_invitation) === 1,
                    }
                  : { status: "not_requested" as const },
                pendingOperationIds: JSON.parse(
                  String(row.pending_operation_ids_json),
                ) as string[],
              };
            }),
            nextPage:
              rows.length > page.pageSize
                ? String(slice.at(-1)?.message_id ?? "")
                : null,
            coverage: await readCoverage(tx, [key.accountId]),
          },
        };
      });
    },
    async readOperation(key) {
      return driver.read(async (tx) => {
        const revision = await readRevision(tx);
        const row = await loadOperation(tx, key.accountId, key.operationId);
        return {
          revision,
          operation: row ? toOperationState(row) : null,
        };
      });
    },
    async getDiagnostics(accountId) {
      return driver.read(async (tx) => {
        const revision = await readRevision(tx);
        const pending = await tx.query(
          `SELECT COUNT(*) AS n, MIN(created_at_ms) AS oldest FROM operations
           WHERE account_id = ? AND status IN (${PENDING_STATUSES.map(() => "?").join(",")})`,
          [accountId, ...PENDING_STATUSES],
        );
        const uncertain = await tx.query(
          `SELECT COUNT(*) AS n FROM operations WHERE account_id = ? AND status = 'uncertain'`,
          [accountId],
        );
        const jobs = await tx.query(
          "SELECT COUNT(*) AS n FROM sync_jobs WHERE account_id = ?",
          [accountId],
        );
        const operationRows = await tx.query(
          "SELECT * FROM operations WHERE account_id = ? ORDER BY created_at_ms ASC, rowid ASC",
          [accountId],
        );
        const targets = await tx.query(
          "SELECT command_id, message_id, conversation_id FROM operation_targets WHERE account_id = ?",
          [accountId],
        );
        const conversations = await tx.query(
          "SELECT command_id, conversation_id FROM operation_conversations WHERE account_id = ?",
          [accountId],
        );
        const account = await tx.query(
          "SELECT connection FROM accounts WHERE account_id = ?",
          [accountId],
        );
        return {
          accountId,
          revision,
          connection: connectionStatus(account[0]?.connection),
          coverage: await readCoverage(tx, [accountId]),
          pendingOperations: Number(pending[0]?.n ?? 0),
          uncertainOperations: Number(uncertain[0]?.n ?? 0),
          pendingJobs: Number(jobs[0]?.n ?? 0),
          oldestPendingAtMs:
            pending[0]?.oldest == null ? null : Number(pending[0].oldest),
          commands: operationRows.map((row) => {
            const payload = parseOperationPayload(row.payload_json);
            const operationId = String(row.command_id);
            return {
              operationId,
              status: String(row.status) as OperationState["status"],
              kind: payload.kind,
              changeKind: payload.changeKind,
              change: payload.change,
              messageIds: [
                ...payload.messageIds,
                ...targets
                  .filter((target) => String(target.command_id) === operationId)
                  .map((target) => String(target.message_id)),
              ].filter(
                (value, index, values) => values.indexOf(value) === index,
              ),
              conversationIds: [
                ...conversations
                  .filter(
                    (conversation) =>
                      String(conversation.command_id) === operationId,
                  )
                  .map((conversation) => String(conversation.conversation_id)),
                ...targets
                  .filter(
                    (target) =>
                      String(target.command_id) === operationId &&
                      target.conversation_id != null,
                  )
                  .map((target) => String(target.conversation_id)),
                ...payload.conversationIds,
              ].filter(
                (value, index, values) => values.indexOf(value) === index,
              ),
            };
          }),
        };
      });
    },
    async inspect(input) {
      return driver.read((tx) => inspectState(tx, input));
    },
    async registerSyncScopes(input) {
      return driver.write(async (tx) => {
        if (!(await accountGenerationMatches(tx, input.session))) return false;
        let inserted = 0;
        for (const scopeId of input.scopeIds) {
          const result = await tx.execute(
            `INSERT OR IGNORE INTO coverage(account_id, scope_id, metadata, content, indexed_content, last_completed_sync_at_ms)
             VALUES (?, ?, 'partial', 'not_requested', 'not_requested', NULL)`,
            [input.session.accountId, scopeId],
          );
          inserted += result.changedRows;
        }
        if (inserted > 0) await bumpRevision(tx);
        return inserted > 0;
      });
    },
    async readAccountSyncStates() {
      return driver.read(async (tx) => {
        const accounts = await tx.query(
          "SELECT account_id, generation, assistant_cursor FROM accounts ORDER BY account_id",
        );
        const streams = await tx.query(
          "SELECT account_id, stream_id, generation, checkpoint FROM sync_streams ORDER BY account_id, stream_id",
        );
        const streamsByAccount = new Map<
          string,
          Array<{
            accountId: string;
            streamId: string;
            generation: string;
            checkpoint: string | null;
          }>
        >();
        for (const stream of streams) {
          const accountId = String(stream.account_id);
          const list = streamsByAccount.get(accountId) ?? [];
          list.push({
            accountId,
            streamId: String(stream.stream_id),
            generation: String(stream.generation),
            checkpoint: nullableString(stream.checkpoint),
          });
          streamsByAccount.set(accountId, list);
        }
        return accounts.map((row) => {
          const accountId = String(row.account_id);
          const accountStreams = streamsByAccount.get(accountId) ?? [];
          return {
            accountId,
            generation: String(row.generation),
            assistantCursor:
              row.assistant_cursor == null
                ? null
                : String(row.assistant_cursor),
            streams: accountStreams,
            stream:
              accountStreams.find((stream) => stream.streamId === "primary") ??
              null,
          };
        });
      });
    },
    async readBootstrapScan(input) {
      return driver.read(async (tx) => {
        const rows = await tx.query(
          `SELECT * FROM bootstrap_scans
           WHERE account_id = ? AND scope_id = ?`,
          [input.session.accountId, input.scopeId],
        );
        const row = rows[0];
        if (!row) return null;
        return {
          accountId: String(row.account_id),
          scopeId: String(row.scope_id),
          bootstrapId: String(row.bootstrap_id),
          page: nullableString(row.page),
          from: {
            streamId: String(row.from_stream_id),
            generation: String(row.from_generation),
            checkpoint: nullableString(row.from_checkpoint),
          },
          catchUpFrom:
            row.catch_stream_id == null
              ? null
              : {
                  streamId: String(row.catch_stream_id),
                  generation: String(row.catch_generation),
                  checkpoint: nullableString(row.catch_checkpoint),
                },
          nextAttemptAtMs:
            row.next_attempt_at_ms == null
              ? null
              : Number(row.next_attempt_at_ms),
          errorCode: row.error_code == null ? null : String(row.error_code),
        };
      });
    },
    async startBootstrapScan(input) {
      return driver.write(async (tx) => {
        if (!(await accountGenerationMatches(tx, input.session))) {
          return { status: "stale" as const };
        }
        const existing = await tx.query(
          "SELECT 1 FROM bootstrap_scans WHERE account_id = ? AND scope_id = ?",
          [input.session.accountId, input.scopeId],
        );
        if (
          existing.length > 0 ||
          !(await streamPositionMatches(
            tx,
            input.session.accountId,
            input.from,
          ))
        ) {
          return { status: "stale" as const };
        }
        await tx.execute(
          "DELETE FROM bootstrap_seen_messages WHERE account_id = ? AND scope_id = ?",
          [input.session.accountId, input.scopeId],
        );
        await tx.execute(
          "DELETE FROM bootstrap_existing_messages WHERE account_id = ? AND scope_id = ?",
          [input.session.accountId, input.scopeId],
        );
        await snapshotBootstrapExistingMessages(
          tx,
          input.session.accountId,
          input.scopeId,
        );
        await tx.execute(
          `INSERT INTO bootstrap_scans(
             account_id, scope_id, bootstrap_id, page,
             from_stream_id, from_generation, from_checkpoint,
             catch_stream_id, catch_generation, catch_checkpoint,
             next_attempt_at_ms, error_code, updated_at_ms
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
           ON CONFLICT(account_id, scope_id) DO UPDATE SET
             bootstrap_id = excluded.bootstrap_id,
             page = excluded.page,
             from_stream_id = excluded.from_stream_id,
             from_generation = excluded.from_generation,
             from_checkpoint = excluded.from_checkpoint,
             catch_stream_id = excluded.catch_stream_id,
             catch_generation = excluded.catch_generation,
             catch_checkpoint = excluded.catch_checkpoint,
             next_attempt_at_ms = NULL,
             error_code = NULL,
             updated_at_ms = excluded.updated_at_ms`,
          [
            input.session.accountId,
            input.scopeId,
            input.bootstrapId,
            input.page,
            input.from.streamId,
            input.from.generation,
            input.from.checkpoint,
            input.catchUpFrom?.streamId ?? null,
            input.catchUpFrom?.generation ?? null,
            input.catchUpFrom?.checkpoint ?? null,
            input.nowMs,
          ],
        );
        const revision = await bumpRevision(tx);
        return { status: "committed" as const, revision };
      });
    },
    async applyBootstrapPage(input) {
      return driver.write(async (tx) => {
        if (!(await accountGenerationMatches(tx, input.session))) {
          return { status: "stale" as const };
        }
        const scan = await tx.query(
          `SELECT * FROM bootstrap_scans
           WHERE account_id = ? AND scope_id = ?`,
          [input.session.accountId, input.scopeId],
        );
        const current = scan[0];
        if (
          !current ||
          String(current.bootstrap_id) !== input.bootstrapId ||
          nullableString(current.page) !== input.previousPage ||
          String(current.from_stream_id) !== input.from.streamId ||
          String(current.from_generation) !== input.from.generation ||
          nullableString(current.from_checkpoint) !== input.from.checkpoint ||
          !(await streamPositionMatches(
            tx,
            input.session.accountId,
            input.from,
          ))
        ) {
          return { status: "stale" as const };
        }
        const bodies = input.bodies;
        if (
          !pageFactsBelongToAccount(
            input.session.accountId,
            input.changes,
            input.requiredHydration,
            bodies,
          )
        ) {
          return { status: "stale" as const };
        }
        for (const change of input.changes) {
          if (change.kind === "message_patch") {
            await tx.execute(
              `INSERT OR IGNORE INTO bootstrap_seen_messages(account_id, scope_id, message_id)
               VALUES (?, ?, ?)`,
              [input.session.accountId, input.scopeId, change.key.messageId],
            );
          }
        }
        await applyPageFacts(tx, {
          accountId: input.session.accountId,
          requestId: input.requestId,
          changes: input.changes,
          requiredHydration: input.requiredHydration,
          bodies,
          digest,
        });
        if (input.nextPage) {
          await tx.execute(
            `UPDATE bootstrap_scans
             SET page = ?,
                 catch_stream_id = ?,
                 catch_generation = ?,
                 catch_checkpoint = ?,
                 next_attempt_at_ms = NULL,
                 error_code = NULL,
                 updated_at_ms = ?
             WHERE account_id = ? AND scope_id = ? AND bootstrap_id = ?`,
            [
              input.nextPage,
              input.catchUpFrom?.streamId ?? null,
              input.catchUpFrom?.generation ?? null,
              input.catchUpFrom?.checkpoint ?? null,
              Date.now(),
              input.session.accountId,
              input.scopeId,
              input.bootstrapId,
            ],
          );
        } else {
          const nextStream = input.catchUpFrom ?? input.from;
          await tx.execute(
            `INSERT INTO sync_streams(account_id, stream_id, generation, checkpoint)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(account_id, stream_id) DO UPDATE SET
               generation = excluded.generation,
               checkpoint = excluded.checkpoint`,
            [
              input.session.accountId,
              nextStream.streamId,
              nextStream.generation,
              nextStream.checkpoint,
            ],
          );
          if (scopeAllowsMissingDeletion(input.scopeId)) {
            await tx.execute(
              `UPDATE messages
               SET deleted = 1
               WHERE account_id = ?
                 AND deleted = 0
                 AND EXISTS (
                   SELECT 1
                   FROM bootstrap_existing_messages existing
                   WHERE existing.account_id = messages.account_id
                     AND existing.scope_id = ?
                     AND existing.message_id = messages.message_id
                 )
                 AND NOT EXISTS (
                   SELECT 1
                   FROM bootstrap_seen_messages seen
                   WHERE seen.account_id = messages.account_id
                     AND seen.scope_id = ?
                     AND seen.message_id = messages.message_id
                 )`,
              [input.session.accountId, input.scopeId, input.scopeId],
            );
            await tx.execute(
              `DELETE FROM effective_messages
               WHERE account_id = ?
                 AND EXISTS (
                   SELECT 1
                   FROM bootstrap_existing_messages existing
                   WHERE existing.account_id = effective_messages.account_id
                     AND existing.scope_id = ?
                     AND existing.message_id = effective_messages.message_id
                 )
                 AND NOT EXISTS (
                   SELECT 1
                   FROM bootstrap_seen_messages seen
                   WHERE seen.account_id = effective_messages.account_id
                     AND seen.scope_id = ?
                     AND seen.message_id = effective_messages.message_id
                 )`,
              [input.session.accountId, input.scopeId, input.scopeId],
            );
          } else {
            await clearStaleBootstrapScopeMembership(
              tx,
              input.session.accountId,
              input.scopeId,
            );
          }
          await tx.execute(
            `INSERT INTO coverage(account_id, scope_id, metadata, content, indexed_content, last_completed_sync_at_ms)
             VALUES (?, ?, 'complete', 'partial', 'partial', ?)
             ON CONFLICT(account_id, scope_id) DO UPDATE SET
               metadata = 'complete',
               last_completed_sync_at_ms = excluded.last_completed_sync_at_ms`,
            [input.session.accountId, nextStream.streamId, Date.now()],
          );
          await tx.execute(
            "DELETE FROM bootstrap_scans WHERE account_id = ? AND scope_id = ?",
            [input.session.accountId, input.scopeId],
          );
          await tx.execute(
            "DELETE FROM bootstrap_seen_messages WHERE account_id = ? AND scope_id = ?",
            [input.session.accountId, input.scopeId],
          );
          await tx.execute(
            "DELETE FROM bootstrap_existing_messages WHERE account_id = ? AND scope_id = ?",
            [input.session.accountId, input.scopeId],
          );
        }
        const revision = await bumpRevision(tx);
        return { status: "committed" as const, revision };
      });
    },
    async deferBootstrapScan(input) {
      return driver.write(async (tx) => {
        if (!(await accountGenerationMatches(tx, input.session))) {
          return { status: "stale" as const };
        }
        const result = await tx.execute(
          `UPDATE bootstrap_scans
           SET next_attempt_at_ms = ?,
               error_code = ?,
               updated_at_ms = ?
           WHERE account_id = ?
             AND scope_id = ?
             AND bootstrap_id = ?
             AND page = ?`,
          [
            input.nextAttemptAtMs,
            input.errorCode,
            Date.now(),
            input.session.accountId,
            input.scopeId,
            input.bootstrapId,
            input.page,
          ],
        );
        if (result.changedRows === 0) return { status: "stale" as const };
        const revision = await bumpRevision(tx);
        return { status: "committed" as const, revision };
      });
    },
    async enqueueHydration(input) {
      return driver.write(async (tx) => {
        await enqueueHydrationJobs(tx, {
          keys: input.keys,
          purpose: input.purpose,
          digest,
        });
        return bumpRevision(tx);
      });
    },
    async enqueueSearch(input) {
      return driver.write(async (tx) => {
        const jobId = `search:${input.accountId}:${await digest({
          predicate: input.predicate,
          page: input.page,
        })}`;
        await tx.execute(
          `INSERT OR IGNORE INTO sync_jobs(job_id, account_id, kind, payload_json)
           VALUES (?, ?, 'search', ?)`,
          [
            jobId,
            input.accountId,
            JSON.stringify({
              predicate: input.predicate,
              page: input.page,
            }),
          ],
        );
        return bumpRevision(tx);
      });
    },
    async completeJob(input) {
      await driver.write(async (tx) => {
        await tx.execute(
          "DELETE FROM sync_jobs WHERE job_id = ? AND attempt_id = ?",
          [input.jobId, input.attemptId],
        );
      });
    },
    async recordConnection(input) {
      return driver.write(async (tx) => {
        // Every sync request reports its connection; only a change should
        // republish the views.
        const updated = await tx.execute(
          "UPDATE accounts SET connection = ? WHERE account_id = ? AND IFNULL(connection, 'ready') != ?",
          [input.connection, input.accountId, input.connection],
        );
        if (updated.changedRows === 0) return false;
        await bumpRevision(tx);
        return true;
      });
    },
    async failOperation(key, code) {
      return driver.write(async (tx) => {
        const current = await loadOperation(tx, key.accountId, key.operationId);
        if (!current) return { status: "stale" as const };
        if (
          current.status === "succeeded" ||
          current.status === "failed" ||
          current.status === "cancelled" ||
          current.status === "superseded"
        ) {
          return { status: "stale" as const };
        }
        await tx.execute(
          `UPDATE operations
           SET status = 'failed', error_code = ?, error_retryable = 0, claimed_by = NULL, attempt_id = NULL
           WHERE account_id = ? AND command_id = ?`,
          [code, key.accountId, key.operationId],
        );
        await unfreezeSendDraft(
          tx,
          key.accountId,
          current.payload_json,
          key.operationId,
        );
        const targets = await tx.query(
          "SELECT message_id FROM operation_targets WHERE account_id = ? AND command_id = ?",
          [key.accountId, key.operationId],
        );
        await recomputeTargets(
          tx,
          targets.map((row) => ({
            accountId: key.accountId,
            messageId: String(row.message_id),
          })),
        );
        return {
          status: "committed" as const,
          revision: await bumpRevision(tx),
        };
      });
    },
    async failPreparation(input) {
      return driver.write(async (tx) => {
        if (!(await accountGenerationMatches(tx, input.session))) {
          return { status: "stale" as const };
        }
        const failed = await tx.execute(
          `UPDATE operations
           SET status = 'failed',
               error_code = ?,
               error_retryable = 0,
               claimed_by = NULL,
               claimed_until_ms = NULL,
               attempt_id = NULL
           WHERE account_id = ? AND command_id = ?
             AND status = 'preparing'
             AND attempt_id = ?`,
          [input.code, input.accountId, input.commandId, input.attemptId],
        );
        if (failed.changedRows === 0) return { status: "stale" as const };
        const targets = await tx.query(
          "SELECT message_id FROM operation_targets WHERE account_id = ? AND command_id = ?",
          [input.accountId, input.commandId],
        );
        await recomputeTargets(
          tx,
          targets.map((row) => ({
            accountId: input.accountId,
            messageId: String(row.message_id),
          })),
        );
        return {
          status: "committed" as const,
          revision: await bumpRevision(tx),
        };
      });
    },
    async deferPreparation(input) {
      return driver.write(async (tx) => {
        const deferred = await tx.execute(
          `UPDATE operations
           SET claimed_by = NULL, claimed_until_ms = NULL, attempt_id = NULL, next_attempt_at_ms = ?
           WHERE account_id = ? AND command_id = ?
             AND status = 'preparing'
             AND attempt_id = ?`,
          [
            input.nextAttemptAtMs,
            input.accountId,
            input.commandId,
            input.attemptId,
          ],
        );
        if (deferred.changedRows === 0) return { status: "stale" as const };
        return {
          status: "committed" as const,
          revision: await bumpRevision(tx),
        };
      });
    },
    async applyAssistantEntries(input) {
      return driver.write(async (tx) => {
        for (const entry of input.entries) {
          await tx.execute(
            `INSERT INTO assistant_entries(
               account_id, entry_id, revision, message_id, conversation_id, kind, payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(account_id, entry_id) DO UPDATE SET
               revision = excluded.revision,
               message_id = excluded.message_id,
               conversation_id = excluded.conversation_id,
               kind = excluded.kind,
               payload_json = excluded.payload_json`,
            [
              input.accountId,
              entry.id,
              entry.revision,
              entry.messageId,
              entry.conversationId,
              entry.kind,
              JSON.stringify(entry.payload ?? null),
            ],
          );
        }
        if (input.cursor !== undefined) {
          await tx.execute(
            "UPDATE accounts SET assistant_cursor = ? WHERE account_id = ?",
            [input.cursor, input.accountId],
          );
        }
        return bumpRevision(tx);
      });
    },
    close: () => driver.close(),
  };
  return store;
}

async function rejectIfQueueFull(
  tx: SqlTransaction,
  accountId: string,
  maxPendingOperations: number,
): Promise<Admission | null> {
  const queued = await tx.query(
    `SELECT COUNT(*) AS n FROM operations WHERE account_id = ? AND status IN (${PENDING_STATUSES.map(() => "?").join(",")})`,
    [accountId, ...PENDING_STATUSES],
  );
  if (Number(queued[0]?.n ?? 0) >= maxPendingOperations) {
    return { status: "rejected", code: "queue_full" };
  }
  return null;
}

async function admitExact(
  tx: SqlTransaction,
  input: SubmitMetadataCommand,
  maxPendingOperations: number,
  digest: (value: unknown) => Promise<string>,
): Promise<Admission> {
  for (const target of input.targets) {
    if (target.accountId !== input.accountId) {
      return { status: "rejected", code: "invalid" };
    }
  }
  const payload = {
    kind: "metadata",
    targets: input.targets,
    change: input.change,
  };
  const hash = await digest(payload);
  const existing = await loadOperation(tx, input.accountId, input.commandId);
  if (existing) {
    if (String(existing.intent_hash) === hash) {
      return {
        status: "already_recorded",
        operation: { accountId: input.accountId, operationId: input.commandId },
        revision: await readRevision(tx),
      };
    }
    return { status: "rejected", code: "invalid" };
  }
  const full = await rejectIfQueueFull(
    tx,
    input.accountId,
    maxPendingOperations,
  );
  if (full) return full;
  await tx.execute(
    `INSERT INTO operations(
       account_id, command_id, status, authority, intent_hash, executable_hash,
       payload_json, executable_payload_json, attempts, created_at_ms
     ) VALUES (?, ?, 'queued', 'backend', ?, ?, ?, ?, 0, ?)`,
    [
      input.accountId,
      input.commandId,
      hash,
      hash,
      JSON.stringify(payload),
      JSON.stringify(payload),
      Date.now(),
    ],
  );
  for (const target of input.targets) {
    await tx.execute(
      "INSERT INTO operation_targets(account_id, command_id, message_id) VALUES (?, ?, ?)",
      [input.accountId, input.commandId, target.messageId],
    );
  }
  await recomputeTargets(tx, input.targets);
  return {
    status: "queued",
    operation: { accountId: input.accountId, operationId: input.commandId },
    revision: await bumpRevision(tx),
  };
}

async function admitConversations(
  tx: SqlTransaction,
  input: SubmitConversationCommand,
  maxPendingOperations: number,
  runtime: Pick<HostRuntime, "randomId">,
  digest: (value: unknown) => Promise<string>,
): Promise<Admission> {
  const revision = await readRevision(tx);
  if (revision.databaseEpoch !== input.observedRevision.databaseEpoch) {
    return { status: "rejected", code: "stale_selection" };
  }
  const existing = await loadOperation(tx, input.accountId, input.commandId);
  const payload = {
    kind: "conversations",
    conversations: input.conversations,
    change: input.change,
  };
  const hash = await digest(payload);
  if (existing) {
    if (String(existing.intent_hash) === hash) {
      return {
        status: "already_recorded",
        operation: { accountId: input.accountId, operationId: input.commandId },
        revision,
      };
    }
    return { status: "rejected", code: "invalid" };
  }
  let complete = true;
  const knownTargets: Array<MessageKey & { conversationId: string }> = [];
  for (const conversation of input.conversations) {
    if (conversation.accountId !== input.accountId) {
      return { status: "rejected", code: "invalid" };
    }
    const flag = await tx.query(
      "SELECT complete FROM conversation_completeness WHERE account_id = ? AND conversation_id = ?",
      [conversation.accountId, conversation.conversationId],
    );
    if (!flag[0] || Number(flag[0].complete) !== 1) complete = false;
    const messages = await tx.query(
      "SELECT message_id FROM messages WHERE account_id = ? AND conversation_id = ? AND deleted = 0",
      [conversation.accountId, conversation.conversationId],
    );
    knownTargets.push(
      ...messages.map((row) => ({
        accountId: conversation.accountId,
        messageId: String(row.message_id),
        conversationId: conversation.conversationId,
      })),
    );
  }
  if (complete && knownTargets.length > 0) {
    return admitExact(
      tx,
      {
        accountId: input.accountId,
        commandId: input.commandId,
        targets: knownTargets.map(({ accountId, messageId }) => ({
          accountId,
          messageId,
        })),
        change: input.change,
      },
      maxPendingOperations,
      digest,
    );
  }
  const full = await rejectIfQueueFull(
    tx,
    input.accountId,
    maxPendingOperations,
  );
  if (full) return full;
  await tx.execute(
    `INSERT INTO operations(
       account_id, command_id, status, authority, intent_hash, payload_json, attempts, created_at_ms
     ) VALUES (?, ?, 'preparing', 'backend', ?, ?, 0, ?)`,
    [
      input.accountId,
      input.commandId,
      hash,
      JSON.stringify(payload),
      Date.now(),
    ],
  );
  for (const conversation of input.conversations) {
    await tx.execute(
      `INSERT INTO operation_conversations(account_id, command_id, conversation_id, resolution_id, next_page, complete)
       VALUES (?, ?, ?, ?, NULL, 0)`,
      [
        input.accountId,
        input.commandId,
        conversation.conversationId,
        runtime.randomId(),
      ],
    );
  }
  // Membership resolution needs the network, so apply the change to the
  // messages already stored; preparation adds any the provider reports later.
  for (const target of knownTargets) {
    await tx.execute(
      `INSERT INTO operation_targets(account_id, command_id, message_id, conversation_id)
       VALUES (?, ?, ?, ?)`,
      [
        target.accountId,
        input.commandId,
        target.messageId,
        target.conversationId,
      ],
    );
  }
  await recomputeTargets(tx, knownTargets);
  return {
    status: "preparing",
    operation: { accountId: input.accountId, operationId: input.commandId },
    revision: await bumpRevision(tx),
  };
}

async function saveDraftRow(
  tx: SqlTransaction,
  input: SaveDraft,
): Promise<DraftSaveResult> {
  const current = await tx.query(
    "SELECT revision, frozen FROM drafts WHERE account_id = ? AND draft_id = ?",
    [input.key.accountId, input.key.draftId],
  );
  const currentRevision = current[0] ? Number(current[0].revision) : null;
  if (current[0] && Number(current[0].frozen) === 1) {
    return { status: "conflict", currentDraftRevision: currentRevision };
  }
  if (input.expectedRevision !== currentRevision) {
    return { status: "conflict", currentDraftRevision: currentRevision };
  }
  const next = (currentRevision ?? 0) + 1;
  await tx.execute(
    `INSERT INTO drafts(account_id, draft_id, revision, content_json, frozen, updated_at_ms)
     VALUES (?, ?, ?, ?, 0, ?)
     ON CONFLICT(account_id, draft_id) DO UPDATE SET
       revision = excluded.revision,
       content_json = excluded.content_json,
       updated_at_ms = excluded.updated_at_ms
     WHERE frozen = 0`,
    [
      input.key.accountId,
      input.key.draftId,
      next,
      JSON.stringify(input.content),
      Date.now(),
    ],
  );
  return {
    status: "saved",
    draftRevision: next,
    revision: await bumpRevision(tx),
  };
}

async function inspectState(
  tx: SqlTransaction,
  input: MailStoreInspectionInput = {},
): Promise<MailStoreInspection> {
  const revision = await readRevision(tx);
  const limit = clampInspectionLimit(input.limit);
  const accountIds = input.accountIds?.slice(0, 50) ?? [];
  const accountWhere = accountIds.length
    ? `WHERE account_id IN (${accountIds.map(() => "?").join(",")})`
    : "";
  const accountBindings = accountIds;
  const accounts = await tx.query(
    `SELECT * FROM accounts ${accountWhere} ORDER BY account_id LIMIT ?`,
    [...accountBindings, limit],
  );
  const scopedAccountIds = accounts.map((row) => String(row.account_id));
  const scopedWhere = scopedAccountIds.length
    ? `WHERE account_id IN (${scopedAccountIds.map(() => "?").join(",")})`
    : "WHERE 0 = 1";
  const confirmedRows = await tx.query(
    `SELECT * FROM messages ${scopedWhere} ORDER BY account_id, message_id LIMIT ?`,
    [...scopedAccountIds, limit],
  );
  const effectiveRows = await tx.query(
    `SELECT * FROM effective_messages ${scopedWhere} ORDER BY account_id, message_id LIMIT ?`,
    [...scopedAccountIds, limit],
  );
  const effectiveById = new Map(
    effectiveRows.map((row) => [`${row.account_id}:${row.message_id}`, row]),
  );
  const operations = await tx.query(
    `SELECT * FROM operations ${scopedWhere} ORDER BY account_id, command_id LIMIT ?`,
    [...scopedAccountIds, limit],
  );
  return {
    revision,
    accounts: accounts.map((row) => ({
      accountId: String(row.account_id),
      provider: String(row.provider) as "google" | "microsoft",
      generation: String(row.generation),
      assistantCursor:
        row.assistant_cursor == null ? null : String(row.assistant_cursor),
      connection: connectionStatus(row.connection),
    })),
    messages: confirmedRows.map((row) => {
      const confirmed = confirmedFromRow(row);
      const effective = effectiveById.get(
        `${row.account_id}:${row.message_id}`,
      );
      return {
        accountId: confirmed.accountId,
        messageId: confirmed.messageId,
        conversationId: confirmed.conversationId,
        confirmed,
        effective: effective
          ? {
              ...metadataFromEffective(effective),
              pendingOperationIds: JSON.parse(
                String(effective.pending_operation_ids_json),
              ) as string[],
            }
          : { ...confirmed, pendingOperationIds: [] },
        deleted: confirmed.deleted,
      };
    }),
    operations: operations.map(toOperationState),
    operationTargets: (
      await tx.query(
        `SELECT account_id, command_id, message_id, outcome, code
         FROM operation_targets ${scopedWhere}
         ORDER BY account_id, command_id, message_id LIMIT ?`,
        [...scopedAccountIds, limit],
      )
    ).map((row) => ({
      accountId: String(row.account_id),
      operationId: String(row.command_id),
      messageId: String(row.message_id),
      outcome:
        row.outcome == null
          ? null
          : (String(row.outcome) as "applied" | "rejected" | "uncertain"),
      code: row.code == null ? null : String(row.code),
    })),
    assistantEntries: (
      await tx.query(
        `SELECT * FROM assistant_entries ${scopedWhere}
         ORDER BY account_id, entry_id LIMIT ?`,
        [...scopedAccountIds, limit],
      )
    ).map((row) => ({
      accountId: String(row.account_id),
      id: String(row.entry_id),
      revision: String(row.revision),
      messageId: row.message_id == null ? null : String(row.message_id),
      conversationId:
        row.conversation_id == null ? null : String(row.conversation_id),
      kind: String(row.kind),
      payload: parseJsonValue(row.payload_json),
    })),
    coverage: await readCoverage(tx, scopedAccountIds),
    streams: (
      await tx.query(
        `SELECT * FROM sync_streams ${scopedWhere}
         ORDER BY account_id, stream_id LIMIT ?`,
        [...scopedAccountIds, limit],
      )
    ).map((row) => ({
      accountId: String(row.account_id),
      streamId: String(row.stream_id),
      generation: String(row.generation),
      checkpoint: row.checkpoint === null ? null : String(row.checkpoint),
    })),
  };
}

function clampInspectionLimit(limit: number | undefined) {
  if (limit === undefined) return 100;
  if (!Number.isFinite(limit)) return 100;
  return Math.max(1, Math.min(1000, Math.trunc(limit)));
}

async function resetAccountForGeneration(
  tx: SqlTransaction,
  input: {
    accountId: string;
    provider: "google" | "microsoft";
    generation: string;
  },
) {
  await deleteAccountSearchIndex(tx, input.accountId);
  const derivedTables = [
    "message_content",
    "effective_messages",
    "effective_role_conversations",
    "effective_message_memberships",
    "sync_streams",
    "bootstrap_seen_messages",
    "bootstrap_existing_messages",
    "bootstrap_scans",
    "coverage",
    "sync_jobs",
    "conversation_completeness",
    "assistant_entries",
    "messages",
  ];
  for (const table of derivedTables) {
    await tx.execute(`DELETE FROM ${table} WHERE account_id = ?`, [
      input.accountId,
    ]);
  }
  await tx.execute(
    `UPDATE accounts
     SET provider = ?,
         generation = ?,
         assistant_cursor = NULL
     WHERE account_id = ?`,
    [input.provider, input.generation, input.accountId],
  );
}

function pageFactsBelongToAccount(
  accountId: string,
  changes: ProviderChange[],
  requiredHydration: MessageKey[],
  bodies: BodyObservation[],
) {
  return (
    changes.every((change) =>
      providerChangeBelongsToAccount(change, accountId),
    ) &&
    requiredHydration.every((key) => key.accountId === accountId) &&
    bodies.every((body) => body.key.accountId === accountId)
  );
}

async function applyPageFacts(
  tx: SqlTransaction,
  input: {
    accountId: string;
    requestId: string;
    changes: ProviderChange[];
    requiredHydration: MessageKey[];
    bodies: BodyObservation[];
    digest: (value: unknown) => Promise<string>;
  },
) {
  for (const change of input.changes) {
    await applyChange(tx, change);
  }
  for (const body of input.bodies) {
    if (await isStaleMessageVersion(tx, body.key, body.version)) continue;
    await insertMessageContent(tx, body);
  }
  await enqueueHydrationJobs(tx, {
    keys: input.requiredHydration,
    purpose: "body",
    skipFreshContent: true,
    digest: input.digest,
  });
}

async function enqueueHydrationJobs(
  tx: SqlTransaction,
  input: {
    keys: MessageKey[];
    purpose: "metadata" | "body";
    skipFreshContent?: boolean;
    digest: (value: unknown) => Promise<string>;
  },
) {
  const keysByAccount = new Map<string, MessageKey[]>();
  const seen = new Set<string>();
  for (const key of input.keys) {
    const identity = `${key.accountId}\0${key.messageId}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const keys = keysByAccount.get(key.accountId) ?? [];
    keys.push(key);
    keysByAccount.set(key.accountId, keys);
  }
  for (const [accountId, accountKeys] of keysByAccount) {
    let sortedKeys = [...accountKeys].sort((a, b) =>
      a.messageId.localeCompare(b.messageId),
    );
    if (input.skipFreshContent && input.purpose === "body") {
      sortedKeys = await filterKeysNeedingBodyHydration(
        tx,
        accountId,
        sortedKeys,
      );
    }
    for (const keys of chunkMessageKeys(sortedKeys, HYDRATION_JOB_KEY_LIMIT)) {
      const jobId = `hydrate:${accountId}:${input.purpose}:${await input.digest(keys)}`;
      await tx.execute(
        `INSERT OR IGNORE INTO sync_jobs(job_id, account_id, kind, payload_json)
         VALUES (?, ?, 'hydrate', ?)`,
        [jobId, accountId, JSON.stringify({ keys, purpose: input.purpose })],
      );
    }
  }
}

async function filterKeysNeedingBodyHydration(
  tx: SqlTransaction,
  accountId: string,
  keys: MessageKey[],
) {
  const needed: MessageKey[] = [];
  for (const slice of chunkMessageKeys(keys, HYDRATION_JOB_KEY_LIMIT)) {
    const rows = await tx.query(
      `SELECT m.message_id, m.version AS message_version, c.message_id AS content_message_id, c.version AS content_version
       FROM messages m
       LEFT JOIN message_content c
         ON c.account_id = m.account_id AND c.message_id = m.message_id
       WHERE m.account_id = ? AND m.message_id IN (${slice.map(() => "?").join(",")})`,
      [accountId, ...slice.map((key) => key.messageId)],
    );
    const rowsByMessageId = new Map(
      rows.map((row) => [String(row.message_id), row]),
    );
    for (const key of slice) {
      const row = rowsByMessageId.get(key.messageId);
      if (!row || !contentCoversMessageVersion(row)) needed.push(key);
    }
  }
  return needed;
}

function contentCoversMessageVersion(
  row: Record<string, import("./driver").SqlValue>,
) {
  if (row.content_message_id == null) return false;
  if (row.message_version == null) return true;
  if (row.content_version == null) return false;
  const messageVersion = String(row.message_version);
  const contentVersion = String(row.content_version);
  const comparison = compareProviderVersions(contentVersion, messageVersion);
  return comparison === "same" || comparison === "newer";
}

function chunkMessageKeys(keys: MessageKey[], size: number) {
  const chunks: MessageKey[][] = [];
  for (let index = 0; index < keys.length; index += size) {
    chunks.push(keys.slice(index, index + size));
  }
  return chunks;
}

async function snapshotBootstrapExistingMessages(
  tx: SqlTransaction,
  accountId: string,
  scopeId: string,
) {
  if (scopeAllowsMissingDeletion(scopeId)) {
    await tx.execute(
      `INSERT OR IGNORE INTO bootstrap_existing_messages(account_id, scope_id, message_id)
       SELECT account_id, ?, message_id
       FROM messages
       WHERE account_id = ? AND deleted = 0`,
      [scopeId, accountId],
    );
    return;
  }
  const folderId = folderIdForBootstrapScope(scopeId);
  await tx.execute(
    `INSERT OR IGNORE INTO bootstrap_existing_messages(account_id, scope_id, message_id)
     SELECT account_id, ?, message_id
     FROM messages
     WHERE account_id = ? AND deleted = 0 AND folder_id = ?`,
    [scopeId, accountId, folderId],
  );
}

async function clearStaleBootstrapScopeMembership(
  tx: SqlTransaction,
  accountId: string,
  scopeId: string,
) {
  const folderId = folderIdForBootstrapScope(scopeId);
  const missing = await tx.query(
    `SELECT existing.message_id
     FROM bootstrap_existing_messages existing
     LEFT JOIN bootstrap_seen_messages seen
       ON seen.account_id = existing.account_id
      AND seen.scope_id = existing.scope_id
      AND seen.message_id = existing.message_id
     WHERE existing.account_id = ?
       AND existing.scope_id = ?
       AND seen.message_id IS NULL`,
    [accountId, scopeId],
  );
  for (const row of missing) {
    const key = { accountId, messageId: String(row.message_id) };
    const confirmed = await loadConfirmed(tx, key);
    if (!confirmed || confirmed.deleted || confirmed.folderId !== folderId) {
      continue;
    }
    const next: ConfirmedMessage = {
      ...confirmed,
      folderId: null,
      labelIds: confirmed.labelIds.filter(
        (labelId) =>
          labelId !== folderId &&
          !(folderId === "inbox" && labelId.toUpperCase() === "INBOX"),
      ),
      roles: confirmed.roles.filter((role) => role !== "inbox"),
    };
    await upsertConfirmed(tx, next);
    await recomputeTargets(tx, [key]);
  }
}

async function applyChange(tx: SqlTransaction, change: ProviderChange) {
  if (change.kind === "message_patch") {
    const current = await loadConfirmed(tx, change.key);
    const base: MessageMetadata = current ?? {
      subject: "",
      preview: "",
      from: "",
      to: [],
      cc: [],
      receivedAtMs: 0,
      read: true,
      starred: false,
      folderId: null,
      labelIds: [],
      categoryIds: [],
      roles: [],
      hasAttachments: false,
    };
    const metadata = applyMetadataPatch(base, change.fields);
    await upsertConfirmed(tx, {
      ...metadata,
      accountId: change.key.accountId,
      messageId: change.key.messageId,
      conversationId: change.reference.conversationId,
      version: change.reference.version,
      deleted: false,
    });
    await recomputeTargets(tx, [change.key]);
    return;
  }
  if (change.kind === "message_deleted") {
    await tx.execute(
      "UPDATE messages SET deleted = 1 WHERE account_id = ? AND message_id = ?",
      [change.key.accountId, change.key.messageId],
    );
    await tx.execute(
      "DELETE FROM effective_messages WHERE account_id = ? AND message_id = ?",
      [change.key.accountId, change.key.messageId],
    );
  }
  if (change.kind === "removed_from_scope") {
    const current = await loadConfirmed(tx, change.key);
    if (!current) return;
    const scopeFolderId = folderIdForBootstrapScope(change.scopeId);
    const namedInbox =
      change.scopeId === "inbox" || change.scopeId.endsWith(":inbox");
    const leftItsFolder =
      current.folderId != null &&
      (current.folderId === scopeFolderId ||
        current.folderId === change.scopeId);
    if (!namedInbox && !(leftItsFolder && current.roles.includes("inbox"))) {
      return;
    }
    const next = applyMetadataChange(current, { kind: "archive" });
    await upsertConfirmed(tx, {
      ...current,
      ...next,
      folderId: leftItsFolder ? null : current.folderId,
    });
    await recomputeTargets(tx, [change.key]);
  }
}

async function upsertConfirmed(tx: SqlTransaction, message: ConfirmedMessage) {
  const flags = roleFlags(message.roles);
  await tx.execute(
    `INSERT INTO messages(
       account_id, message_id, conversation_id, provider, version, subject, preview, external_url,
       from_address, to_json, cc_json, received_at_ms, read, starred, folder_id, inbox_section, label_ids_json, category_ids_json,
       roles_json, in_inbox, in_sent, in_draft, in_trash, in_spam, has_attachments, snoozed_until_ms, deleted
     ) VALUES (?, ?, ?, COALESCE((SELECT provider FROM accounts WHERE account_id = ?), 'google'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, message_id) DO UPDATE SET
       conversation_id = excluded.conversation_id,
       version = excluded.version,
       subject = excluded.subject,
       preview = excluded.preview,
       external_url = excluded.external_url,
       from_address = excluded.from_address,
       to_json = excluded.to_json,
       cc_json = excluded.cc_json,
       received_at_ms = excluded.received_at_ms,
       read = excluded.read,
       starred = excluded.starred,
       folder_id = excluded.folder_id,
       inbox_section = excluded.inbox_section,
       label_ids_json = excluded.label_ids_json,
       category_ids_json = excluded.category_ids_json,
       roles_json = excluded.roles_json,
       in_inbox = excluded.in_inbox,
       in_sent = excluded.in_sent,
       in_draft = excluded.in_draft,
       in_trash = excluded.in_trash,
       in_spam = excluded.in_spam,
       has_attachments = excluded.has_attachments,
       snoozed_until_ms = excluded.snoozed_until_ms,
       deleted = excluded.deleted`,
    [
      message.accountId,
      message.messageId,
      message.conversationId,
      message.accountId,
      message.version,
      message.subject,
      message.preview,
      message.externalUrl ?? null,
      message.from,
      JSON.stringify(message.to),
      JSON.stringify(message.cc),
      message.receivedAtMs,
      message.read ? 1 : 0,
      message.starred ? 1 : 0,
      message.folderId,
      message.inboxSection ?? null,
      JSON.stringify(message.labelIds),
      JSON.stringify(message.categoryIds),
      JSON.stringify(message.roles),
      flags.inbox,
      flags.sent,
      flags.draft,
      flags.trash,
      flags.spam,
      message.hasAttachments ? 1 : 0,
      message.snoozedUntilMs ?? null,
      message.deleted ? 1 : 0,
    ],
  );
}

async function recomputeTargets(tx: SqlTransaction, targets: MessageKey[]) {
  for (const target of targets) {
    const confirmed = await loadConfirmed(tx, target);
    if (!confirmed || confirmed.deleted) {
      await tx.execute(
        "DELETE FROM effective_messages WHERE account_id = ? AND message_id = ?",
        [target.accountId, target.messageId],
      );
      continue;
    }
    const pendingRows = await tx.query(
      `SELECT o.command_id, o.executable_payload_json, o.payload_json, o.status, t.outcome
       FROM operations o
       JOIN operation_targets t
         ON t.account_id = o.account_id AND t.command_id = o.command_id
       WHERE t.account_id = ? AND t.message_id = ?
         AND (o.executable_hash IS NOT NULL OR o.status = 'preparing')`,
      [target.accountId, target.messageId],
    );
    const pending = pendingRows
      .filter((row) => {
        const outcome = row.outcome == null ? null : String(row.outcome);
        if (outcome === "applied" || outcome === "rejected") return false;
        const status = String(row.status) as OperationState["status"];
        return status === "preparing" || isPendingEffectStatus(status);
      })
      .map((row) => {
        const payload = JSON.parse(
          String(row.executable_payload_json ?? row.payload_json),
        ) as {
          change: SubmitMetadataCommand["change"];
          targets?: MessageKey[];
        };
        return {
          operationId: String(row.command_id),
          change: payload.change,
          // Preparing payloads name conversations; the join scopes the row.
          targets: payload.targets ?? [target],
        };
      });
    const effective = deriveEffectiveMessage(confirmed, pending);
    const flags = roleFlags(effective.roles);
    await tx.execute(
      `INSERT INTO effective_messages(
         account_id, message_id, conversation_id, subject, preview, external_url, from_address, to_json,
         received_at_ms, read, starred, folder_id, inbox_section, label_ids_json, category_ids_json, roles_json,
         in_inbox, in_sent, in_draft, in_trash, in_spam, has_attachments, snoozed_until_ms, pending_operation_ids_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, message_id) DO UPDATE SET
         conversation_id = excluded.conversation_id,
         subject = excluded.subject,
         preview = excluded.preview,
         external_url = excluded.external_url,
         from_address = excluded.from_address,
         to_json = excluded.to_json,
         received_at_ms = excluded.received_at_ms,
         read = excluded.read,
         starred = excluded.starred,
         folder_id = excluded.folder_id,
         inbox_section = excluded.inbox_section,
         label_ids_json = excluded.label_ids_json,
         category_ids_json = excluded.category_ids_json,
         roles_json = excluded.roles_json,
         in_inbox = excluded.in_inbox,
         in_sent = excluded.in_sent,
         in_draft = excluded.in_draft,
         in_trash = excluded.in_trash,
         in_spam = excluded.in_spam,
         has_attachments = excluded.has_attachments,
         snoozed_until_ms = excluded.snoozed_until_ms,
         pending_operation_ids_json = excluded.pending_operation_ids_json`,
      [
        effective.accountId,
        effective.messageId,
        effective.conversationId,
        effective.subject,
        effective.preview,
        effective.externalUrl ?? null,
        effective.from,
        JSON.stringify(effective.to),
        effective.receivedAtMs,
        effective.read ? 1 : 0,
        effective.starred ? 1 : 0,
        effective.folderId,
        effective.inboxSection ?? null,
        JSON.stringify(effective.labelIds),
        JSON.stringify(effective.categoryIds),
        JSON.stringify(effective.roles),
        flags.inbox,
        flags.sent,
        flags.draft,
        flags.trash,
        flags.spam,
        effective.hasAttachments ? 1 : 0,
        effective.snoozedUntilMs ?? null,
        JSON.stringify(effective.pendingOperationIds),
      ],
    );
  }
}

async function loadConfirmed(tx: SqlTransaction, key: MessageKey) {
  const rows = await tx.query(
    "SELECT * FROM messages WHERE account_id = ? AND message_id = ?",
    [key.accountId, key.messageId],
  );
  return rows[0] ? confirmedFromRow(rows[0]) : null;
}

async function hydrationAttemptMatches(
  tx: SqlTransaction,
  input: {
    accountId: string;
    jobId: string;
    attemptId: string;
  },
) {
  const rows = await tx.query(
    `SELECT 1 FROM sync_jobs
     WHERE account_id = ? AND job_id = ? AND kind = 'hydrate' AND attempt_id = ?
     LIMIT 1`,
    [input.accountId, input.jobId, input.attemptId],
  );
  return rows.length > 0;
}

async function loadOperation(
  tx: SqlTransaction,
  accountId: string,
  commandId: string,
) {
  const rows = await tx.query(
    "SELECT * FROM operations WHERE account_id = ? AND command_id = ?",
    [accountId, commandId],
  );
  return rows[0] ?? null;
}

async function toPrepared(
  tx: SqlTransaction,
  row: Record<string, import("./driver").SqlValue>,
): Promise<PreparedOperation | null> {
  if (!row.executable_payload_json) return null;
  const payload = JSON.parse(
    String(row.executable_payload_json),
  ) as PreparedOperation["intent"];
  const account = await tx.query(
    "SELECT generation FROM accounts WHERE account_id = ?",
    [row.account_id],
  );
  return {
    key: {
      accountId: String(row.account_id),
      operationId: String(row.command_id),
    },
    session: {
      accountId: String(row.account_id),
      generation: String(account[0]?.generation ?? ""),
    },
    authority: "backend",
    payloadHash: String(row.executable_hash),
    intent: payload,
  };
}

async function bumpRevision(tx: SqlTransaction): Promise<LocalRevision> {
  await tx.execute(
    "UPDATE profile_state SET sequence = sequence + 1 WHERE id = 1",
  );
  return readRevision(tx);
}

async function accountGenerationMatches(
  tx: SqlTransaction,
  session: { accountId: string; generation: string },
) {
  const rows = await tx.query(
    "SELECT generation FROM accounts WHERE account_id = ?",
    [session.accountId],
  );
  return rows[0] ? String(rows[0].generation) === session.generation : false;
}

async function streamPositionMatches(
  tx: SqlTransaction,
  accountId: string,
  position: { streamId: string; generation: string; checkpoint: string | null },
) {
  const rows = await tx.query(
    "SELECT generation, checkpoint FROM sync_streams WHERE account_id = ? AND stream_id = ?",
    [accountId, position.streamId],
  );
  if (!rows[0]) return position.checkpoint === null;
  return (
    String(rows[0].generation) === position.generation &&
    nullableString(rows[0].checkpoint) === position.checkpoint
  );
}

function nullableString(value: import("./driver").SqlValue | undefined) {
  return value == null ? null : String(value);
}

function providerChangeKey(change: ProviderChange): MessageKey | null {
  if (
    change.kind === "message_patch" ||
    change.kind === "removed_from_scope" ||
    change.kind === "message_deleted"
  ) {
    return change.key;
  }
  return null;
}

function providerChangeBelongsToAccount(
  change: ProviderChange,
  accountId: string,
) {
  const key = providerChangeKey(change);
  return !key || key.accountId === accountId;
}

function scopeAllowsMissingDeletion(scopeId: string) {
  return scopeId === "account:all" || scopeId === "all";
}

function folderIdForBootstrapScope(scopeId: string) {
  return scopeId.startsWith("folder:")
    ? scopeId.slice("folder:".length)
    : scopeId;
}

function inboxSection(value: string): MessageMetadata["inboxSection"] {
  return value === "focused" || value === "other" ? value : null;
}

function parseJsonValue(value: import("./driver").SqlValue): unknown {
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function confirmedFromRow(
  row: Record<string, import("./driver").SqlValue>,
): ConfirmedMessage {
  return {
    accountId: String(row.account_id),
    messageId: String(row.message_id),
    conversationId: String(row.conversation_id),
    version: row.version === null ? null : String(row.version),
    deleted: Number(row.deleted) === 1,
    subject: String(row.subject),
    preview: String(row.preview),
    externalUrl:
      row.external_url == null ? undefined : String(row.external_url),
    from: String(row.from_address),
    to: JSON.parse(String(row.to_json)) as string[],
    cc: JSON.parse(String(row.cc_json)) as string[],
    receivedAtMs: Number(row.received_at_ms),
    read: Number(row.read) === 1,
    starred: Number(row.starred) === 1,
    folderId: row.folder_id === null ? null : String(row.folder_id),
    inboxSection:
      row.inbox_section == null
        ? null
        : inboxSection(String(row.inbox_section)),
    labelIds: JSON.parse(String(row.label_ids_json)) as string[],
    categoryIds: JSON.parse(String(row.category_ids_json)) as string[],
    roles: JSON.parse(String(row.roles_json)) as MessageMetadata["roles"],
    hasAttachments: Number(row.has_attachments) === 1,
    snoozedUntilMs:
      row.snoozed_until_ms == null ? null : Number(row.snoozed_until_ms),
  };
}

function toOperationState(
  row: Record<string, import("./driver").SqlValue>,
): OperationState {
  return {
    key: {
      accountId: String(row.account_id),
      operationId: String(row.command_id),
    },
    status: String(row.status) as OperationState["status"],
    authority: String(row.authority) as OperationState["authority"],
    attempts: Number(row.attempts),
    nextAttemptAtMs:
      row.next_attempt_at_ms == null ? null : Number(row.next_attempt_at_ms),
    error: row.error_code
      ? {
          code: String(row.error_code),
          retryable: Number(row.error_retryable) === 1,
        }
      : null,
  };
}

function roleFlags(roles: MessageMetadata["roles"]) {
  return {
    inbox: roles.includes("inbox") ? 1 : 0,
    sent: roles.includes("sent") ? 1 : 0,
    draft: roles.includes("draft") ? 1 : 0,
    trash: roles.includes("trash") ? 1 : 0,
    spam: roles.includes("spam") ? 1 : 0,
  };
}

async function hasUnsatisfiedDependency(
  tx: SqlTransaction,
  row: Record<string, import("./driver").SqlValue>,
) {
  const attachmentBlock = await hasUnsatisfiedAttachments(tx, row);
  if (attachmentBlock) return true;
  const blockers = await tx.query(
    `SELECT 1
     FROM operation_targets mine
     JOIN operation_targets other
       ON other.account_id = mine.account_id
      AND other.message_id = mine.message_id
      AND other.command_id != mine.command_id
     JOIN operations o
       ON o.account_id = other.account_id AND o.command_id = other.command_id
     WHERE mine.account_id = ? AND mine.command_id = ?
       AND (
         o.status IN ('executing', 'verifying', 'uncertain', 'blocked_auth', 'needs_attention')
         OR (
           o.status IN ('queued', 'retry_wait')
           AND o.rowid < (
             SELECT rowid FROM operations
             WHERE account_id = mine.account_id AND command_id = mine.command_id
           )
         )
       )
     LIMIT 1`,
    [row.account_id, row.command_id],
  );
  return blockers.length > 0;
}

async function insertMessageContent(tx: SqlTransaction, body: BodyObservation) {
  await tx.execute(
    `INSERT INTO message_content(account_id, message_id, version, html, text, attachments_json, is_meeting_invitation)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, message_id) DO UPDATE SET
       version = excluded.version, html = excluded.html, text = excluded.text,
       attachments_json = excluded.attachments_json,
       is_meeting_invitation = excluded.is_meeting_invitation`,
    [
      body.key.accountId,
      body.key.messageId,
      body.version,
      body.html,
      body.text,
      JSON.stringify(body.attachments ?? []),
      body.isMeetingInvitation ? 1 : 0,
    ],
  );
  await indexMessageContent(tx, body.key, body.text ?? body.html ?? "");
}

async function isStaleMessageVersion(
  tx: SqlTransaction,
  key: MessageKey,
  incomingVersion: string | null,
) {
  if (!incomingVersion) return false;
  const current = await loadConfirmed(tx, key);
  if (!current?.version) return false;
  const comparison = compareProviderVersions(incomingVersion, current.version);
  return comparison === "older" || comparison === "unknown";
}

function compareProviderVersions(left: string, right: string) {
  if (left === right) return "same" as const;
  if (isDecimalVersion(left) && isDecimalVersion(right)) {
    const leftNumber = BigInt(left);
    const rightNumber = BigInt(right);
    if (leftNumber < rightNumber) return "older" as const;
    if (leftNumber > rightNumber) return "newer" as const;
    return "same" as const;
  }
  return "unknown" as const;
}

function isDecimalVersion(value: string) {
  return /^\d+$/.test(value);
}

function resolveTargetOutcomes(
  operation: PreparedOperation,
  reported: TargetOutcome[],
  fallback: TargetOutcome["outcome"],
  fallbackCode: string | null = null,
): TargetOutcome[] {
  const keys =
    operation.intent.kind === "metadata" ? operation.intent.targets : [];
  if (keys.length === 0) return reported;
  const byId = new Map(
    reported.map((target) => [
      `${target.key.accountId}:${target.key.messageId}`,
      target,
    ]),
  );
  return keys.map(
    (key) =>
      byId.get(`${key.accountId}:${key.messageId}`) ?? {
        key,
        outcome: fallback,
        code: fallbackCode,
      },
  );
}

async function persistTargetOutcomes(
  tx: SqlTransaction,
  key: { accountId: string; operationId: string },
  targets: TargetOutcome[],
) {
  for (const target of targets) {
    await tx.execute(
      `UPDATE operation_targets
       SET outcome = ?, code = ?
       WHERE account_id = ? AND command_id = ? AND message_id = ?`,
      [
        target.outcome,
        target.code,
        key.accountId,
        key.operationId,
        target.key.messageId,
      ],
    );
  }
}

function operationStatusFromTargets(
  targets: TargetOutcome[],
  completeStatus: "succeeded" | "failed",
) {
  if (targets.length === 0) return completeStatus;
  const applied = targets.some((target) => target.outcome === "applied");
  const rejected = targets.some((target) => target.outcome === "rejected");
  const uncertain = targets.some((target) => target.outcome === "uncertain");
  if (uncertain) return "uncertain";
  if (applied && rejected) return "needs_attention";
  if (rejected && !applied) return "failed";
  if (applied && !rejected) return "succeeded";
  return completeStatus;
}

function isInspectableOperationStatus(status: import("./driver").SqlValue) {
  return status === "uncertain" || status === "verifying";
}

function boundReceiptId(value: string | null | undefined) {
  return value ? value : null;
}

function frozenDraftIdFromPayload(value: import("./driver").SqlValue) {
  try {
    const payload = JSON.parse(String(value)) as {
      kind?: string;
      frozenDraftId?: string;
    };
    if (payload.kind !== "send" || typeof payload.frozenDraftId !== "string") {
      return null;
    }
    return payload.frozenDraftId || null;
  } catch {
    return null;
  }
}

async function unfreezeSendDraft(
  tx: SqlTransaction,
  accountId: string,
  payload: import("./driver").SqlValue,
  commandId: string,
) {
  const frozenDraftId = frozenDraftIdFromPayload(payload);
  if (!frozenDraftId) return;
  const live = await tx.query(
    `SELECT payload_json FROM operations
     WHERE account_id = ? AND command_id != ? AND status IN (${PENDING_STATUSES.map(() => "?").join(",")})`,
    [accountId, commandId, ...PENDING_STATUSES],
  );
  if (
    live.some(
      (row) => frozenDraftIdFromPayload(row.payload_json) === frozenDraftId,
    )
  ) {
    return;
  }
  await tx.execute(
    "UPDATE drafts SET frozen = 0 WHERE account_id = ? AND draft_id = ?",
    [accountId, frozenDraftId],
  );
}

function parseOperationPayload(value: import("./driver").SqlValue) {
  try {
    const payload = JSON.parse(String(value)) as {
      kind?: string;
      change?: Record<string, unknown> & { kind?: string };
      replyToConversationId?: string | null;
      replyToMessageId?: string | null;
    };
    return {
      kind: payload.kind ?? "unknown",
      changeKind: payload.change?.kind ?? null,
      change: payload.change ?? null,
      conversationIds: payload.replyToConversationId
        ? [payload.replyToConversationId]
        : [],
      messageIds: payload.replyToMessageId ? [payload.replyToMessageId] : [],
    };
  } catch {
    return {
      kind: "unknown",
      changeKind: null,
      change: null,
      conversationIds: [],
      messageIds: [],
    };
  }
}

function parseStoredAttachments(
  value: import("./driver").SqlValue,
): MessageAttachmentDescriptor[] {
  if (value === null || value === undefined) return [];
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = messageAttachmentDescriptorSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function clampMaxPendingOperations(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return MAX_QUEUE;
  }
  return Math.min(Math.floor(value), MAX_QUEUE);
}

function withIndexedCoverage<
  T extends {
    view: { coverage: import("@inboxzero/mail-core/queries").Coverage[] };
  },
>(result: T, capabilities: { fts5: boolean }): T {
  if (capabilities.fts5) return result;
  return {
    ...result,
    view: {
      ...result.view,
      coverage: result.view.coverage.map((item) => ({
        ...item,
        indexedContent: "not_requested" as const,
      })),
    },
  };
}

async function hasUnsatisfiedAttachments(
  tx: SqlTransaction,
  row: Record<string, import("./driver").SqlValue>,
) {
  const payload = row.executable_payload_json ?? row.payload_json;
  if (payload == null) return false;
  try {
    const parsed = JSON.parse(String(payload)) as {
      kind?: unknown;
      attachmentIds?: unknown;
    };
    if (parsed.kind !== "send" || !Array.isArray(parsed.attachmentIds)) {
      return false;
    }
    const ids = parsed.attachmentIds.filter(
      (id): id is string => typeof id === "string",
    );
    if (ids.length === 0) return false;
    const rows = await tx.query(
      `SELECT attachment_id, remote_status FROM draft_attachments
       WHERE account_id = ? AND attachment_id IN (${ids.map(() => "?").join(",")})`,
      [String(row.account_id), ...ids],
    );
    if (rows.length === 0) return false;
    const uploaded = new Set(
      rows
        .filter((item) => String(item.remote_status) === "uploaded")
        .map((item) => String(item.attachment_id)),
    );
    return ids.some((id) => !uploaded.has(id));
  } catch {
    return false;
  }
}

async function claimUploadWork(
  tx: SqlTransaction,
  input: { ownerId: string; nowMs: number; leaseMs: number },
  randomId: () => string,
): Promise<ClaimedWork | null> {
  const rows = await tx.query(
    `SELECT o.*, a.generation, d.attachment_id, d.checksum, d.size_bytes, d.filename, d.content_type
     FROM operations o
     JOIN accounts a ON a.account_id = o.account_id
     JOIN draft_attachments d ON d.account_id = o.account_id
     WHERE o.status IN ('queued', 'retry_wait')
       AND o.executable_payload_json IS NOT NULL
       AND (o.next_attempt_at_ms IS NULL OR o.next_attempt_at_ms <= ?)
       AND d.remote_status = 'local'
       AND EXISTS (
         SELECT 1 FROM json_each(json_extract(o.executable_payload_json, '$.attachmentIds'))
         WHERE value = d.attachment_id
       )
     ORDER BY o.created_at_ms
     LIMIT 1`,
    [input.nowMs],
  );
  if (!rows[0]) return null;
  const attemptId = randomId();
  const claimed = await tx.execute(
    `UPDATE operations
     SET claimed_by = ?, claimed_until_ms = ?, attempt_id = ?
     WHERE account_id = ? AND command_id = ?
       AND status IN ('queued', 'retry_wait')
       AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)`,
    [
      input.ownerId,
      input.nowMs + input.leaseMs,
      attemptId,
      rows[0].account_id,
      rows[0].command_id,
      input.nowMs,
    ],
  );
  if (claimed.changedRows === 0) return null;
  const prepared = await toPrepared(tx, rows[0]);
  if (!prepared) return null;
  return {
    kind: "upload",
    attemptId,
    operation: prepared,
    attachmentId: String(rows[0].attachment_id),
    checksum: String(rows[0].checksum),
    sizeBytes: Number(rows[0].size_bytes),
    filename: String(rows[0].filename),
    contentType: String(rows[0].content_type),
  };
}

function resolveStoreRuntime(
  runtime?: Pick<HostRuntime, "randomId" | "sha256" | "nowMs">,
): Pick<HostRuntime, "randomId" | "sha256" | "nowMs"> {
  return {
    randomId: runtime?.randomId ?? defaultStoreRandomId,
    sha256: runtime?.sha256 ?? defaultStoreSha256,
    nowMs: runtime?.nowMs ?? (() => Date.now()),
  };
}

function defaultStoreRandomId(): string {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === "function")
    return cryptoObj.randomUUID();
  throw new Error(
    "createSqliteMailStore requires options.runtime.randomId when crypto.randomUUID is unavailable",
  );
}

async function defaultStoreSha256(bytes: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (typeof subtle?.digest !== "function") {
    throw new Error(
      "createSqliteMailStore requires options.runtime.sha256 when crypto.subtle.digest is unavailable",
    );
  }
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Uint8Array(await subtle.digest("SHA-256", copy));
}

export type { SyncPage, ConversationKey };
