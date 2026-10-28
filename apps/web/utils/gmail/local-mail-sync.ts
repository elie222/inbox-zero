import type { gmail_v1 } from "@googleapis/gmail";
import { z } from "zod";
import { toLocalMailMessage } from "@/utils/email/local-mail-sync";
import {
  withLocalMailSyncBudget,
  gmailMailSyncCosts,
} from "@/utils/email/local-mail-sync-budget";
import { parseMessage } from "@/utils/gmail/message";
import { getGmailMailboxChangeIds } from "@/utils/gmail/mailbox-sync";
import { extractErrorInfo } from "@/utils/gmail/retry";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage, MessageWithPayload } from "@/utils/types";

const scope = "mail-excluding-spam-trash-drafts";
const cursorSchema = z.object({
  version: z.literal(1),
  provider: z.literal("google"),
  emailAccountId: z.string().min(1),
  scope: z.literal(scope),
  phase: z.enum(["backfill", "changes"]),
  after: z.number().int(),
  before: z.number().int().optional(),
  historyId: z.string().regex(/^\d+$/),
  pageToken: z.string().min(1).optional(),
});
type Cursor = z.infer<typeof cursorSchema>;
type Input = {
  emailAccountId: string;
  gmail: gmail_v1.Gmail;
  logger: Logger;
  after: Date;
  before?: Date;
  limit: number;
  priority?: "backfill" | "current";
};

export async function captureGmailMailHistoryCursor({
  emailAccountId,
  gmail,
  after,
  before,
}: Pick<Input, "emailAccountId" | "gmail" | "logger" | "after" | "before">) {
  validateBounds(after, before);
  const response = await withLocalMailSyncBudget(
    {
      emailAccountId,
      provider: "google",
      priority: "current",
      cost: gmailMailSyncCosts.profile,
    },
    (signal) =>
      gmail.users.getProfile(
        { userId: "me" },
        { signal, retry: false, timeout: 30_000 },
      ),
  );
  const historyId = response.data.historyId;
  if (!historyId || !/^\d+$/.test(historyId))
    throw new Error("Gmail did not return a valid mailbox history ID");
  return encodeCursor({
    version: 1,
    provider: "google",
    emailAccountId,
    scope,
    phase: "changes",
    after: after.getTime(),
    before: before?.getTime(),
    historyId,
  });
}

export async function getGmailMailBackfillPage(
  input: Input & { before: Date; cursor?: string },
) {
  const { emailAccountId, gmail, after, before, limit } = input;
  validateBounds(after, before);
  validateLimit(limit);
  const checkpoint = input.cursor
    ? decodeCursor(input.cursor, "backfill", emailAccountId, after, before)
    : decodeCursor(
        await captureGmailMailHistoryCursor(input),
        "changes",
        emailAccountId,
        after,
        before,
      );
  // Gmail date queries have second precision; exact filtering owns the boundary.
  const response = await withLocalMailSyncBudget(
    {
      emailAccountId,
      provider: "google",
      priority: input.priority ?? "backfill",
      cost: gmailMailSyncCosts.list,
    },
    (signal) =>
      gmail.users.messages.list(
        {
          userId: "me",
          q: `${after.getTime() === -8_640_000_000_000_000 ? "" : `after:${Math.floor(after.getTime() / 1000) - 1} `}before:${Math.ceil(before.getTime() / 1000) + 1} -in:spam -in:trash -in:drafts`,
          includeSpamTrash: false,
          maxResults: limit,
          pageToken: checkpoint.pageToken,
        },
        { signal, retry: false, timeout: 30_000 },
      ),
  );
  const messageIds = (response.data.messages ?? []).map((message) => {
    if (!message.id)
      throw new Error("Gmail returned a sync message without an ID");
    return message.id;
  });
  const nextPageToken = response.data.nextPageToken;
  if (nextPageToken && nextPageToken === checkpoint.pageToken)
    throw new Error("Gmail backfill continuation did not advance");
  return {
    messageIds: [...new Set(messageIds)],
    nextCursor: nextPageToken
      ? encodeCursor({
          ...checkpoint,
          phase: "backfill",
          pageToken: nextPageToken,
        })
      : undefined,
    historyCursor: encodeCursor({
      ...checkpoint,
      phase: "changes",
      pageToken: undefined,
    }),
  };
}

export async function getGmailMailChangesPage(
  input: Input & { cursor: string },
) {
  const { emailAccountId, gmail, after, before, limit } = input;
  validateBounds(after, before);
  validateLimit(limit);
  const checkpoint = decodeCursor(
    input.cursor,
    "changes",
    emailAccountId,
    after,
    before,
  );
  let response: gmail_v1.Schema$ListHistoryResponse;
  try {
    response = (
      await withLocalMailSyncBudget(
        {
          emailAccountId,
          provider: "google",
          priority: input.priority ?? "current",
          cost: gmailMailSyncCosts.history,
        },
        (signal) =>
          gmail.users.history.list(
            {
              userId: "me",
              startHistoryId: checkpoint.historyId,
              pageToken: checkpoint.pageToken,
              historyTypes: [
                "messageAdded",
                "messageDeleted",
                "labelAdded",
                "labelRemoved",
              ],
              maxResults: limit,
            },
            { signal, retry: false, timeout: 30_000 },
          ),
      )
    ).data;
  } catch (error) {
    if (extractErrorInfo(error).status !== 404) throw error;
    return { resetRequired: true as const };
  }
  if (response.nextPageToken && response.nextPageToken === checkpoint.pageToken)
    throw new Error("Gmail history continuation did not advance");
  const { upsertIds, deletedIds } = getGmailMailboxChangeIds(
    response.history ?? [],
  );
  const historyId = response.nextPageToken
    ? checkpoint.historyId
    : response.historyId;
  if (!historyId || !/^\d+$/.test(historyId))
    throw new Error("Gmail did not return a valid mailbox history ID");
  return {
    resetRequired: false as const,
    messageIds: upsertIds,
    confirmedDeletedMessageIds: [...deletedIds],
    cursor: encodeCursor({
      ...checkpoint,
      historyId,
      pageToken: response.nextPageToken ?? undefined,
    }),
    hasMore: Boolean(response.nextPageToken),
  };
}

export async function hydrateGmailMailMessages(
  input: Omit<Input, "limit"> & { messageIds: string[] },
) {
  validateBounds(input.after, input.before);
  const ids = [...new Set(input.messageIds)];
  if (ids.length > 25 || ids.some((id) => !id))
    throw new Error("Gmail hydration requires at most 25 valid message IDs");
  const messages: ParsedMessage[] = [];
  const removedMessageIds: string[] = [];
  const confirmedDeletedMessageIds: string[] = [];
  if (ids.length === 0)
    return { messages, removedMessageIds, confirmedDeletedMessageIds };
  return withLocalMailSyncBudget(
    {
      ...input,
      provider: "google",
      priority: input.priority ?? "backfill",
      cost: ids.length * gmailMailSyncCosts.message,
    },
    async (signal) => {
      // Sequential requests reserve provider concurrency for interactive work.
      for (const id of ids) {
        let raw: gmail_v1.Schema$Message;
        try {
          raw = (
            await input.gmail.users.messages.get(
              { userId: "me", id, format: "full" },
              { signal, retry: false, timeout: 30_000 },
            )
          ).data;
        } catch (error) {
          if (extractErrorInfo(error).status !== 404) throw error;
          confirmedDeletedMessageIds.push(id);
          continue;
        }
        if (raw.id !== id || !raw.payload)
          throw new Error("Gmail returned an incomplete sync message");
        const message = parseMessage(raw as MessageWithPayload);
        if (isInScope(message, input.after, input.before))
          messages.push(toLocalMailMessage(message));
        else removedMessageIds.push(id);
      }
      return { messages, removedMessageIds, confirmedDeletedMessageIds };
    },
  );
}

function isInScope(message: ParsedMessage, after: Date, before?: Date) {
  const timestamp = Number(message.internalDate);
  if (!message.internalDate || !Number.isSafeInteger(timestamp))
    throw new Error("Gmail returned an invalid sync message date");
  return (
    timestamp >= after.getTime() &&
    (before === undefined || timestamp < before.getTime()) &&
    !message.labelIds?.some(
      (label) => label === "SPAM" || label === "TRASH" || label === "DRAFT",
    )
  );
}
function validateBounds(after: Date, before?: Date) {
  if (
    !Number.isFinite(after.getTime()) ||
    (before !== undefined &&
      (!Number.isFinite(before.getTime()) ||
        before.getTime() <= after.getTime()))
  )
    throw new Error("Invalid local mail sync bounds");
}
function validateLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Local mail sync limit must be between 1 and 100");
}
function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
function decodeCursor(
  value: string,
  phase: Cursor["phase"],
  emailAccountId: string,
  after: Date,
  before?: Date,
): Cursor {
  try {
    const cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (
      cursor.phase !== phase ||
      cursor.emailAccountId !== emailAccountId ||
      cursor.after !== after.getTime() ||
      cursor.before !== before?.getTime()
    )
      throw new Error("scope mismatch");
    return cursor;
  } catch {
    throw new Error("Invalid local mail sync cursor");
  }
}
