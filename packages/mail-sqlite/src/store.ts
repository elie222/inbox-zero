import { hashCanonical } from "@inboxzero/mail-core/canonical";
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
  MailStoreInspection,
} from "@inboxzero/mail-core/ports/mail-store";
import type {
  ConversationQuery,
  Coverage,
  MailboxView,
} from "@inboxzero/mail-core/queries";
import type {
  BodyObservation,
  ProviderChange,
  SyncPage,
} from "@inboxzero/mail-core/sync";
import type { SqlTransaction, SqliteDriver } from "./driver";
import { migrateMailbox } from "./migrations";
import { compilePredicate } from "./queries";

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

export type SqliteMailStoreOptions = {
  maxPendingOperations?: number;
};

export async function createSqliteMailStore(
  driver: SqliteDriver,
  options: SqliteMailStoreOptions = {},
): Promise<MailStore> {
  const maxPendingOperations = clampMaxPendingOperations(
    options.maxPendingOperations,
  );
  await driver.write(async (tx) => {
    await migrateMailbox(tx, crypto.randomUUID());
  });

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
          await tx.execute(
            "UPDATE accounts SET generation = ? WHERE account_id = ?",
            [input.generation, input.accountId],
          );
        }
        return bumpRevision(tx);
      });
    },
    async admitMetadata(input) {
      return driver.write((tx) => admitExact(tx, input, maxPendingOperations));
    },
    async admitConversations(input) {
      return driver.write((tx) =>
        admitConversations(tx, input, maxPendingOperations),
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
        if (input.page.conversation.accountId !== input.accountId) {
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
        await tx.execute(
          `UPDATE operation_conversations
           SET next_page = ?, complete = ?
           WHERE account_id = ? AND command_id = ? AND conversation_id = ?`,
          [
            input.page.nextPage,
            input.page.nextPage ? 0 : 1,
            input.accountId,
            input.commandId,
            input.page.conversation.conversationId,
          ],
        );
        if (!input.page.nextPage) {
          await tx.execute(
            `INSERT INTO conversation_completeness(account_id, conversation_id, complete)
             VALUES (?, ?, 1)
             ON CONFLICT(account_id, conversation_id) DO UPDATE SET complete = 1`,
            [input.accountId, input.page.conversation.conversationId],
          );
        }
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
        const executableHash = await hashCanonical(executable);
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
          `SELECT o.account_id, o.command_id, c.conversation_id, c.resolution_id, c.next_page
           FROM operations o
           JOIN operation_conversations c
             ON c.account_id = o.account_id AND c.command_id = o.command_id
           WHERE o.status = 'preparing' AND c.complete = 0
           LIMIT 1`,
        );
        if (preparing[0]) {
          return {
            kind: "prepare" as const,
            commandId: String(preparing[0].command_id),
            accountId: String(preparing[0].account_id),
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
        const queued = await tx.query(
          `SELECT * FROM operations
           WHERE executable_hash IS NOT NULL
             AND (next_attempt_at_ms IS NULL OR next_attempt_at_ms <= ?)
             AND (
               status IN ('queued', 'retry_wait')
               OR (
                 status = 'executing'
                 AND (claimed_by IS NULL OR claimed_until_ms IS NULL OR claimed_until_ms < ?)
               )
             )
           ORDER BY created_at_ms`,
          [input.nowMs, input.nowMs],
        );
        for (const row of queued) {
          if (await hasUnsatisfiedDependency(tx, row)) continue;
          const attemptId = crypto.randomUUID();
          await tx.execute(
            `UPDATE operations
             SET status = 'executing', attempts = attempts + 1, claimed_by = ?, claimed_until_ms = ?, attempt_id = ?
             WHERE account_id = ? AND command_id = ?`,
            [
              input.ownerId,
              input.nowMs + input.leaseMs,
              attemptId,
              row.account_id,
              row.command_id,
            ],
          );
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
          const attemptId = crypto.randomUUID();
          await tx.execute(
            `UPDATE operations
             SET claimed_by = ?, claimed_until_ms = ?, attempt_id = ?
             WHERE account_id = ? AND command_id = ? AND status IN ('uncertain', 'verifying')`,
            [
              input.ownerId,
              input.nowMs + input.leaseMs,
              attemptId,
              row.account_id,
              row.command_id,
            ],
          );
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
          `SELECT * FROM sync_jobs WHERE kind = 'hydrate' AND (claimed_by IS NULL OR claimed_until_ms < ?) LIMIT 1`,
          [input.nowMs],
        );
        if (hydrate[0]) {
          await tx.execute(
            "UPDATE sync_jobs SET claimed_by = ?, claimed_until_ms = ? WHERE job_id = ?",
            [input.ownerId, input.nowMs + input.leaseMs, hydrate[0].job_id],
          );
          const payload = JSON.parse(String(hydrate[0].payload_json)) as {
            keys: MessageKey[];
            purpose: "metadata" | "body";
          };
          return {
            kind: "hydrate" as const,
            jobId: String(hydrate[0].job_id),
            keys: payload.keys,
            purpose: payload.purpose,
          };
        }
        const search = await tx.query(
          `SELECT * FROM sync_jobs WHERE kind = 'search' AND (claimed_by IS NULL OR claimed_until_ms < ?) LIMIT 1`,
          [input.nowMs],
        );
        if (search[0]) {
          await tx.execute(
            "UPDATE sync_jobs SET claimed_by = ?, claimed_until_ms = ? WHERE job_id = ?",
            [input.ownerId, input.nowMs + input.leaseMs, search[0].job_id],
          );
          const payload = JSON.parse(String(search[0].payload_json)) as {
            predicate: import("@inboxzero/mail-core/queries").MailPredicate;
            page: string | null;
          };
          return {
            kind: "search" as const,
            jobId: String(search[0].job_id),
            accountId: String(search[0].account_id),
            predicate: payload.predicate,
            page: payload.page,
          };
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
          account[0] &&
          account[0].generation !== input.page.session.generation
        ) {
          return { status: "stale" };
        }
        for (const change of input.page.changes) {
          await applyChange(tx, change);
        }
        for (const body of input.bodies ?? input.page.bodies ?? []) {
          if (await isStaleMessageVersion(tx, body.key, body.version)) continue;
          await insertMessageContent(tx, body);
        }
        for (const key of input.page.requiredHydration) {
          await tx.execute(
            `INSERT OR IGNORE INTO sync_jobs(job_id, account_id, kind, payload_json)
             VALUES (?, ?, 'hydrate', ?)`,
            [
              `${input.page.requestId}:${key.messageId}`,
              key.accountId,
              JSON.stringify({ keys: [key], purpose: "body" }),
            ],
          );
        }
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
        if (input.result.status === "confirmed") {
          const targets = resolveTargetOutcomes(
            input.operation,
            input.result.targets,
            "applied",
          );
          await persistTargetOutcomes(tx, input.operation.key, targets);
          for (const change of input.result.observations)
            await applyChange(tx, change);
          if (
            input.result.observations.length === 0 &&
            input.operation.intent.kind === "metadata"
          ) {
            for (const target of targets.filter(
              (item) => item.outcome === "applied",
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
              input.result.receiptId,
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
              input.result.retryAfterMs,
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
        const rows = await tx.query(
          "SELECT message_id FROM messages WHERE account_id = ? AND deleted = 0",
          [input.accountId],
        );
        const seen = new Set(input.seenMessageIds);
        const missing = rows.filter((row) => !seen.has(String(row.message_id)));
        for (const row of missing) {
          await applyChange(tx, {
            kind: "message_deleted",
            key: {
              accountId: input.accountId,
              messageId: String(row.message_id),
            },
            evidence: "bootstrap_unseen",
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
        const hash = await hashCanonical({ ...payload, queuedAtMs: 0 });
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
      return driver.read((tx) => readView(tx, query));
    },
    async readConversation(key, page) {
      return driver.read(async (tx) => {
        const revision = await readRevision(tx);
        const rows = await tx.query(
          `SELECT * FROM effective_messages
           WHERE account_id = ? AND conversation_id = ?
           ORDER BY received_at_ms ASC, message_id ASC`,
          [key.accountId, key.conversationId],
        );
        const start = page.after
          ? rows.findIndex((row) => String(row.message_id) === page.after) + 1
          : 0;
        const slice = rows.slice(
          Math.max(start, 0),
          Math.max(start, 0) + page.pageSize,
        );
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
              start + page.pageSize < rows.length
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
              messageIds: targets
                .filter((target) => String(target.command_id) === operationId)
                .map((target) => String(target.message_id)),
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
    async inspect() {
      return driver.read(inspectState);
    },
    async enqueueHydration(input) {
      return driver.write(async (tx) => {
        const accountId = input.keys[0]?.accountId;
        if (!accountId) return readRevision(tx);
        await tx.execute(
          `INSERT OR IGNORE INTO sync_jobs(job_id, account_id, kind, payload_json)
           VALUES (?, ?, 'hydrate', ?)`,
          [
            `hydrate:${input.purpose}:${input.keys.map((key) => key.messageId).join(",")}`,
            accountId,
            JSON.stringify({ keys: input.keys, purpose: input.purpose }),
          ],
        );
        return bumpRevision(tx);
      });
    },
    async enqueueSearch(input) {
      return driver.write(async (tx) => {
        const jobId = `search:${input.accountId}:${await hashCanonical({
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
    async completeJob(jobId) {
      await driver.write(async (tx) => {
        await tx.execute("DELETE FROM sync_jobs WHERE job_id = ?", [jobId]);
      });
    },
    async recordConnection(input) {
      await driver.write(async (tx) => {
        await tx.execute(
          "UPDATE accounts SET connection = ? WHERE account_id = ?",
          [input.connection, input.accountId],
        );
        await bumpRevision(tx);
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
    async applyAssistantEntries(input) {
      return driver.write(async (tx) => {
        for (const entry of input.entries) {
          if (entry.draftId) {
            const draft = await tx.query(
              "SELECT revision, frozen FROM drafts WHERE account_id = ? AND draft_id = ?",
              [input.accountId, entry.draftId],
            );
            if (
              draft[0] &&
              (Number(draft[0].frozen) === 1 ||
                (entry.draftRevision != null &&
                  Number(draft[0].revision) > entry.draftRevision))
            ) {
              continue;
            }
          }
          if (entry.change) await applyChange(tx, entry.change);
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
  const hash = await hashCanonical(payload);
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
  const hash = await hashCanonical(payload);
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
  const knownTargets: MessageKey[] = [];
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
      })),
    );
  }
  if (complete && knownTargets.length > 0) {
    return admitExact(
      tx,
      {
        accountId: input.accountId,
        commandId: input.commandId,
        targets: knownTargets,
        change: input.change,
      },
      maxPendingOperations,
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
        crypto.randomUUID(),
      ],
    );
  }
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
    `INSERT INTO drafts(account_id, draft_id, revision, content_json, frozen)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(account_id, draft_id) DO UPDATE SET
       revision = excluded.revision,
       content_json = excluded.content_json
     WHERE frozen = 0`,
    [
      input.key.accountId,
      input.key.draftId,
      next,
      JSON.stringify(input.content),
    ],
  );
  return {
    status: "saved",
    draftRevision: next,
    revision: await bumpRevision(tx),
  };
}

async function readView(
  tx: SqlTransaction,
  query: ConversationQuery,
): Promise<{ revision: LocalRevision; view: MailboxView }> {
  const revision = await readRevision(tx);
  const compiled = compilePredicate(query.predicate);
  const accountPlaceholders = query.accountIds.map(() => "?").join(",");
  const where = `e.account_id IN (${accountPlaceholders}) AND ${compiled.sql}`;
  const bindings = [...query.accountIds, ...compiled.bindings];
  const grouped = await tx.query(
    `SELECT e.account_id, e.conversation_id, MAX(e.received_at_ms) AS latest,
            MAX(CASE WHEN e.read = 0 THEN 1 ELSE 0 END) AS unread,
            MAX(e.starred) AS starred
     FROM effective_messages e
     WHERE ${where}
     GROUP BY e.account_id, e.conversation_id
     ORDER BY latest DESC, e.account_id ASC, e.conversation_id ASC`,
    bindings,
  );
  let rows = grouped;
  if (query.after) {
    const [latest, accountId, conversationId] = query.after.split("\t");
    const index = grouped.findIndex(
      (row) =>
        String(row.latest) === latest &&
        String(row.account_id) === accountId &&
        String(row.conversation_id) === conversationId,
    );
    rows = index >= 0 ? grouped.slice(index + 1) : grouped;
  }
  const page = rows.slice(0, query.pageSize);
  const summaries = [];
  for (const row of page) {
    const latest = await tx.query(
      `SELECT * FROM effective_messages
       WHERE account_id = ? AND conversation_id = ?
       ORDER BY received_at_ms DESC, message_id DESC LIMIT 1`,
      [row.account_id, row.conversation_id],
    );
    const message = latest[0];
    const members = await tx.query(
      `SELECT from_address, to_json, label_ids_json, roles_json FROM effective_messages
       WHERE account_id = ? AND conversation_id = ?
       ORDER BY received_at_ms ASC, message_id ASC`,
      [row.account_id, row.conversation_id],
    );
    summaries.push({
      key: {
        accountId: String(row.account_id),
        conversationId: String(row.conversation_id),
      },
      subject: message ? String(message.subject) : "",
      preview: message ? String(message.preview) : "",
      from: message ? String(message.from_address) : "",
      to: message ? jsonStringArray(message.to_json).join(", ") : "",
      senders: members
        .map((member) => String(member.from_address))
        .filter(Boolean),
      latestMessageAtMs: Number(row.latest),
      unread: Number(row.unread) === 1,
      starred: Number(row.starred) === 1,
      labelIds: uniqueStrings(
        members.flatMap((member) => jsonStringArray(member.label_ids_json)),
      ),
      roles: uniqueStrings(
        members.flatMap((member) => jsonStringArray(member.roles_json)),
      ) as MessageMetadata["roles"],
      pendingOperationIds: message
        ? (JSON.parse(String(message.pending_operation_ids_json)) as string[])
        : [],
    });
  }
  const matching = await tx.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT 1 FROM effective_messages e WHERE ${where} GROUP BY e.account_id, e.conversation_id
     )`,
    bindings,
  );
  const unread = await tx.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT 1 FROM effective_messages e
       WHERE ${where} AND e.read = 0
       GROUP BY e.account_id, e.conversation_id
     )`,
    bindings,
  );
  const coverage = await readCoverage(tx, query.accountIds);
  const complete = coverage.every((item) => item.metadata === "complete");
  const accountConnections = await tx.query(
    `SELECT connection FROM accounts WHERE account_id IN (${query.accountIds.map(() => "?").join(",")})`,
    query.accountIds,
  );
  return {
    revision,
    view: {
      conversations: summaries,
      counts: {
        matchingConversations: Number(matching[0]?.n ?? 0),
        unreadConversations: Number(unread[0]?.n ?? 0),
        extent: complete ? "complete_scope" : "local_coverage",
      },
      nextPage:
        rows.length > query.pageSize
          ? `${page.at(-1)?.latest}\t${page.at(-1)?.account_id}\t${page.at(-1)?.conversation_id}`
          : null,
      coverage,
      connection: worstConnection(
        accountConnections.map((row) => connectionStatus(row.connection)),
      ),
    },
  };
}

async function inspectState(tx: SqlTransaction): Promise<MailStoreInspection> {
  const revision = await readRevision(tx);
  const accounts = await tx.query("SELECT * FROM accounts");
  const confirmedRows = await tx.query("SELECT * FROM messages");
  const effectiveRows = await tx.query("SELECT * FROM effective_messages");
  const effectiveById = new Map(
    effectiveRows.map((row) => [`${row.account_id}:${row.message_id}`, row]),
  );
  const operations = await tx.query("SELECT * FROM operations");
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
        "SELECT account_id, command_id, message_id, outcome, code FROM operation_targets",
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
    coverage: await readCoverage(
      tx,
      accounts.map((row) => String(row.account_id)),
    ),
    streams: (await tx.query("SELECT * FROM sync_streams")).map((row) => ({
      accountId: String(row.account_id),
      streamId: String(row.stream_id),
      generation: String(row.generation),
      checkpoint: row.checkpoint === null ? null : String(row.checkpoint),
    })),
  };
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
    if (change.scopeId === "inbox" || change.scopeId.endsWith(":inbox")) {
      const next = applyMetadataChange(current, { kind: "archive" });
      await upsertConfirmed(tx, { ...current, ...next });
      await recomputeTargets(tx, [change.key]);
    }
  }
}

async function upsertConfirmed(tx: SqlTransaction, message: ConfirmedMessage) {
  const flags = roleFlags(message.roles);
  await tx.execute(
    `INSERT INTO messages(
       account_id, message_id, conversation_id, provider, version, subject, preview, from_address,
       to_json, cc_json, received_at_ms, read, starred, folder_id, label_ids_json, category_ids_json,
       roles_json, in_inbox, in_sent, in_draft, in_trash, in_spam, has_attachments, deleted
     ) VALUES (?, ?, ?, COALESCE((SELECT provider FROM accounts WHERE account_id = ?), 'google'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, message_id) DO UPDATE SET
       conversation_id = excluded.conversation_id,
       version = excluded.version,
       subject = excluded.subject,
       preview = excluded.preview,
       from_address = excluded.from_address,
       to_json = excluded.to_json,
       cc_json = excluded.cc_json,
       received_at_ms = excluded.received_at_ms,
       read = excluded.read,
       starred = excluded.starred,
       folder_id = excluded.folder_id,
       label_ids_json = excluded.label_ids_json,
       category_ids_json = excluded.category_ids_json,
       roles_json = excluded.roles_json,
       in_inbox = excluded.in_inbox,
       in_sent = excluded.in_sent,
       in_draft = excluded.in_draft,
       in_trash = excluded.in_trash,
       in_spam = excluded.in_spam,
       has_attachments = excluded.has_attachments,
       deleted = excluded.deleted`,
    [
      message.accountId,
      message.messageId,
      message.conversationId,
      message.accountId,
      message.version,
      message.subject,
      message.preview,
      message.from,
      JSON.stringify(message.to),
      JSON.stringify(message.cc),
      message.receivedAtMs,
      message.read ? 1 : 0,
      message.starred ? 1 : 0,
      message.folderId,
      JSON.stringify(message.labelIds),
      JSON.stringify(message.categoryIds),
      JSON.stringify(message.roles),
      flags.inbox,
      flags.sent,
      flags.draft,
      flags.trash,
      flags.spam,
      message.hasAttachments ? 1 : 0,
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
      `SELECT o.command_id, o.executable_payload_json, o.status, t.outcome
       FROM operations o
       JOIN operation_targets t
         ON t.account_id = o.account_id AND t.command_id = o.command_id
       WHERE t.account_id = ? AND t.message_id = ? AND o.executable_hash IS NOT NULL`,
      [target.accountId, target.messageId],
    );
    const pending = pendingRows
      .filter((row) => {
        const outcome = row.outcome == null ? null : String(row.outcome);
        if (outcome === "applied" || outcome === "rejected") return false;
        return isPendingEffectStatus(
          String(row.status) as OperationState["status"],
        );
      })
      .map((row) => {
        const payload = JSON.parse(String(row.executable_payload_json)) as {
          change: SubmitMetadataCommand["change"];
          targets: MessageKey[];
        };
        return {
          operationId: String(row.command_id),
          change: payload.change,
          targets: payload.targets,
        };
      });
    const effective = deriveEffectiveMessage(confirmed, pending);
    const flags = roleFlags(effective.roles);
    await tx.execute(
      `INSERT INTO effective_messages(
         account_id, message_id, conversation_id, subject, preview, from_address, to_json,
         received_at_ms, read, starred, folder_id, label_ids_json, category_ids_json, roles_json,
         in_inbox, in_sent, in_draft, in_trash, in_spam, has_attachments, pending_operation_ids_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, message_id) DO UPDATE SET
         conversation_id = excluded.conversation_id,
         subject = excluded.subject,
         preview = excluded.preview,
         from_address = excluded.from_address,
         to_json = excluded.to_json,
         received_at_ms = excluded.received_at_ms,
         read = excluded.read,
         starred = excluded.starred,
         folder_id = excluded.folder_id,
         label_ids_json = excluded.label_ids_json,
         category_ids_json = excluded.category_ids_json,
         roles_json = excluded.roles_json,
         in_inbox = excluded.in_inbox,
         in_sent = excluded.in_sent,
         in_draft = excluded.in_draft,
         in_trash = excluded.in_trash,
         in_spam = excluded.in_spam,
         has_attachments = excluded.has_attachments,
         pending_operation_ids_json = excluded.pending_operation_ids_json`,
      [
        effective.accountId,
        effective.messageId,
        effective.conversationId,
        effective.subject,
        effective.preview,
        effective.from,
        JSON.stringify(effective.to),
        effective.receivedAtMs,
        effective.read ? 1 : 0,
        effective.starred ? 1 : 0,
        effective.folderId,
        JSON.stringify(effective.labelIds),
        JSON.stringify(effective.categoryIds),
        JSON.stringify(effective.roles),
        flags.inbox,
        flags.sent,
        flags.draft,
        flags.trash,
        flags.spam,
        effective.hasAttachments ? 1 : 0,
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

function connectionStatus(
  value: unknown,
): "ready" | "offline" | "blocked_auth" {
  const connection = String(value ?? "ready");
  return connection === "blocked_auth" || connection === "offline"
    ? connection
    : "ready";
}

function worstConnection(
  values: Array<"ready" | "offline" | "blocked_auth">,
): "ready" | "offline" | "blocked_auth" {
  if (values.includes("blocked_auth")) return "blocked_auth";
  if (values.includes("offline")) return "offline";
  return "ready";
}

async function readRevision(tx: SqlTransaction): Promise<LocalRevision> {
  const rows = await tx.query(
    "SELECT database_epoch, sequence FROM profile_state WHERE id = 1",
  );
  return {
    databaseEpoch: String(rows[0]?.database_epoch ?? ""),
    sequence: Number(rows[0]?.sequence ?? 0),
  };
}

async function readCoverage(
  tx: SqlTransaction,
  accountIds: string[],
): Promise<Coverage[]> {
  if (accountIds.length === 0) return [];
  const rows = await tx.query(
    `SELECT * FROM coverage WHERE account_id IN (${accountIds.map(() => "?").join(",")})`,
    accountIds,
  );
  if (rows.length === 0) {
    return accountIds.map((accountId) => ({
      accountId,
      scopeId: "primary",
      metadata: "partial",
      content: "not_requested",
      indexedContent: "not_requested",
      lastCompletedSyncAtMs: null,
    }));
  }
  return rows.map((row) => ({
    accountId: String(row.account_id),
    scopeId: String(row.scope_id),
    metadata: String(row.metadata) as Coverage["metadata"],
    content: String(row.content) as Coverage["content"],
    indexedContent: String(row.indexed_content) as Coverage["indexedContent"],
    lastCompletedSyncAtMs:
      row.last_completed_sync_at_ms == null
        ? null
        : Number(row.last_completed_sync_at_ms),
  }));
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
    from: String(row.from_address),
    to: JSON.parse(String(row.to_json)) as string[],
    cc: JSON.parse(String(row.cc_json)) as string[],
    receivedAtMs: Number(row.received_at_ms),
    read: Number(row.read) === 1,
    starred: Number(row.starred) === 1,
    folderId: row.folder_id === null ? null : String(row.folder_id),
    labelIds: JSON.parse(String(row.label_ids_json)) as string[],
    categoryIds: JSON.parse(String(row.category_ids_json)) as string[],
    roles: JSON.parse(String(row.roles_json)) as MessageMetadata["roles"],
    hasAttachments: Number(row.has_attachments) === 1,
  };
}

function metadataFromEffective(
  row: Record<string, import("./driver").SqlValue>,
): MessageMetadata {
  return {
    subject: String(row.subject),
    preview: String(row.preview),
    from: String(row.from_address),
    to: JSON.parse(String(row.to_json)) as string[],
    cc: [],
    receivedAtMs: Number(row.received_at_ms),
    read: Number(row.read) === 1,
    starred: Number(row.starred) === 1,
    folderId: row.folder_id === null ? null : String(row.folder_id),
    labelIds: JSON.parse(String(row.label_ids_json)) as string[],
    categoryIds: JSON.parse(String(row.category_ids_json)) as string[],
    roles: JSON.parse(String(row.roles_json)) as MessageMetadata["roles"],
    hasAttachments: Number(row.has_attachments) === 1,
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
  try {
    await tx.execute(
      "DELETE FROM message_fts WHERE account_id = ? AND message_id = ?",
      [body.key.accountId, body.key.messageId],
    );
    await tx.execute(
      `INSERT INTO message_fts(account_id, message_id, subject, preview, from_address, body)
       SELECT account_id, message_id, subject, preview, from_address, ?
       FROM messages WHERE account_id = ? AND message_id = ?`,
      [body.text ?? body.html ?? "", body.key.accountId, body.key.messageId],
    );
  } catch {
    // FTS is optional when the runtime SQLite build omits it.
  }
}

async function isStaleMessageVersion(
  tx: SqlTransaction,
  key: MessageKey,
  incomingVersion: string | null,
) {
  if (!incomingVersion) return false;
  const current = await loadConfirmed(tx, key);
  if (!current?.version) return false;
  const currentNumber = Number(current.version);
  const incomingNumber = Number(incomingVersion);
  if (Number.isFinite(currentNumber) && Number.isFinite(incomingNumber)) {
    return currentNumber > incomingNumber;
  }
  return current.version > incomingVersion;
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
    };
    return {
      kind: payload.kind ?? "unknown",
      changeKind: payload.change?.kind ?? null,
      change: payload.change ?? null,
      conversationIds: payload.replyToConversationId
        ? [payload.replyToConversationId]
        : [],
    };
  } catch {
    return {
      kind: "unknown",
      changeKind: null,
      change: null,
      conversationIds: [],
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

function jsonStringArray(value: import("./driver").SqlValue) {
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

export type { SyncPage, ConversationKey };
