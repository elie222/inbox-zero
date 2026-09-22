import { blobIdSchema } from "@inboxzero/mail-core/identities";
import { PENDING_EFFECT_STATUSES } from "@inboxzero/mail-core/operations";
import type {
  AccountRecord,
  DraftSummary,
  OutboxItem,
} from "@inboxzero/mail-core/queries";
import type { SqlTransaction } from "./driver";
import { connectionStatus } from "./store-read-utils";

export async function readAccountRecords(
  tx: SqlTransaction,
): Promise<AccountRecord[]> {
  const rows = await tx.query(
    "SELECT account_id, provider, generation, connection FROM accounts ORDER BY account_id",
  );
  return rows.map((row) => ({
    accountId: String(row.account_id),
    provider: row.provider === "microsoft" ? "microsoft" : "google",
    generation: String(row.generation),
    connection: connectionStatus(row.connection),
  }));
}

export async function readDraftSummaries(
  tx: SqlTransaction,
  accountIds: string[],
): Promise<DraftSummary[]> {
  if (accountIds.length === 0) return [];
  const rows = await tx.query(
    `SELECT account_id, draft_id, content_json, frozen, updated_at_ms
     FROM drafts
     WHERE account_id IN (${accountIds.map(() => "?").join(",")})
     ORDER BY updated_at_ms DESC, draft_id ASC`,
    accountIds,
  );
  return rows.map((row) => {
    const content = parseDraftContent(row.content_json);
    return {
      key: {
        accountId: String(row.account_id),
        draftId: String(row.draft_id),
      },
      conversationId: content.conversationId,
      subject: content.subject,
      preview: content.preview,
      to: content.to,
      updatedAtMs: Number(row.updated_at_ms ?? 0),
      frozen: Number(row.frozen) === 1,
      attachmentCount: content.attachmentIds.length,
    };
  });
}

export async function readOutboxItems(
  tx: SqlTransaction,
  accountIds: string[],
): Promise<OutboxItem[]> {
  if (accountIds.length === 0) return [];
  const pending = ["preparing", ...PENDING_EFFECT_STATUSES];
  const rows = await tx.query(
    `SELECT account_id, command_id, status, payload_json, executable_payload_json,
            created_at_ms, error_code, error_retryable
     FROM operations
     WHERE account_id IN (${accountIds.map(() => "?").join(",")})
       AND status IN (${pending.map(() => "?").join(",")})
     ORDER BY created_at_ms DESC`,
    [...accountIds, ...pending],
  );
  const items: OutboxItem[] = [];
  for (const row of rows) {
    const payload = parseSendPayload(
      row.executable_payload_json ?? row.payload_json,
    );
    if (!payload) continue;
    const attachmentIds = payload.attachmentIds;
    const missing = await missingAttachmentIds(
      tx,
      String(row.account_id),
      attachmentIds,
    );
    items.push({
      key: {
        accountId: String(row.account_id),
        operationId: String(row.command_id),
      },
      status: payloadStatus(row.status),
      subject: payload.subject,
      to: payload.to,
      createdAtMs: Number(row.created_at_ms),
      error: row.error_code
        ? {
            code: String(row.error_code),
            retryable: Number(row.error_retryable) === 1,
          }
        : null,
      attachmentIds,
      missingAttachmentIds: missing,
    });
  }
  return items;
}

async function missingAttachmentIds(
  tx: SqlTransaction,
  accountId: string,
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) return [];
  const rows = await tx.query(
    `SELECT attachment_id, remote_status FROM draft_attachments
     WHERE account_id = ? AND attachment_id IN (${attachmentIds.map(() => "?").join(",")})`,
    [accountId, ...attachmentIds],
  );
  if (rows.length === 0) return [];
  const ready = new Set(
    rows
      .filter((row) => String(row.remote_status) === "uploaded")
      .map((row) => String(row.attachment_id)),
  );
  return attachmentIds.filter((id) => !ready.has(id));
}

function parseDraftContent(value: import("./driver").SqlValue) {
  try {
    const parsed = JSON.parse(String(value)) as {
      subject?: unknown;
      editableHtml?: unknown;
      to?: unknown;
      attachmentIds?: unknown;
      conversationId?: unknown;
    };
    const attachmentIds = Array.isArray(parsed.attachmentIds)
      ? parsed.attachmentIds.filter(
          (id): id is string =>
            typeof id === "string" && blobIdSchema.safeParse(id).success,
        )
      : [];
    const html =
      typeof parsed.editableHtml === "string" ? parsed.editableHtml : "";
    return {
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      preview: html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      to: Array.isArray(parsed.to)
        ? parsed.to.filter((item): item is string => typeof item === "string")
        : [],
      attachmentIds,
      conversationId:
        typeof parsed.conversationId === "string"
          ? parsed.conversationId
          : null,
    };
  } catch {
    return {
      subject: "",
      preview: "",
      to: [],
      attachmentIds: [],
      conversationId: null,
    };
  }
}

function parseSendPayload(value: import("./driver").SqlValue) {
  if (value == null) return null;
  try {
    const parsed = JSON.parse(String(value)) as {
      kind?: unknown;
      subject?: unknown;
      to?: unknown;
      attachmentIds?: unknown;
    };
    if (parsed.kind !== "send") return null;
    return {
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      to: Array.isArray(parsed.to)
        ? parsed.to.filter((item): item is string => typeof item === "string")
        : [],
      attachmentIds: Array.isArray(parsed.attachmentIds)
        ? parsed.attachmentIds.filter(
            (id): id is string =>
              typeof id === "string" && blobIdSchema.safeParse(id).success,
          )
        : [],
    };
  } catch {
    return null;
  }
}

function payloadStatus(
  value: import("./driver").SqlValue,
): OutboxItem["status"] {
  const status = String(value);
  return status as OutboxItem["status"];
}
