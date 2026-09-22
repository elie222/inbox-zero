import prisma from "@/utils/prisma";
import type { AssistantStatePage } from "@inboxzero/mail-core/ports/assistant-source";

type AssistantCursor =
  | { kind: "updated"; updatedAt: Date; id: string }
  | { kind: "legacy"; id: string };

export async function readAssistantStatePage(input: {
  emailAccountId: string;
  cursor: string | null;
  pageSize?: number;
}): Promise<Omit<AssistantStatePage, "session">> {
  const pageSize = input.pageSize ?? 50;
  const cursor = input.cursor || null;
  const decodedCursor = decodeAssistantCursor(cursor);
  const rows = await prisma.executedRule.findMany({
    where: {
      emailAccountId: input.emailAccountId,
      ...cursorWhere(decodedCursor),
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: pageSize,
    select: {
      id: true,
      updatedAt: true,
      messageId: true,
      threadId: true,
      status: true,
      actionItems: {
        select: { id: true, type: true, executionStatus: true },
      },
    },
  });
  const entries: AssistantStatePage["entries"] = rows.flatMap((row) =>
    row.actionItems.length > 0
      ? row.actionItems.map((action) => ({
          id: `${row.id}:${action.id}`,
          revision: row.updatedAt.toISOString(),
          messageId: row.messageId,
          conversationId: row.threadId,
          kind: String(action.type),
          payload: {
            executedRuleId: row.id,
            status: row.status,
            executionStatus: action.executionStatus,
          },
        }))
      : [
          {
            id: row.id,
            revision: row.updatedAt.toISOString(),
            messageId: row.messageId,
            conversationId: row.threadId,
            kind: "RULE_STATUS",
            payload: {
              executedRuleId: row.id,
              status: row.status,
            },
          },
        ],
  );
  const last = rows.at(-1);
  return {
    cursor,
    nextCursor: last ? encodeAssistantCursor(last) : cursor,
    reset: false,
    entries,
  };
}

function decodeAssistantCursor(cursor: string | null): AssistantCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(cursor) as { updatedAt?: unknown; id?: unknown };
    if (typeof parsed.updatedAt === "string" && typeof parsed.id === "string") {
      const updatedAt = new Date(parsed.updatedAt);
      if (!Number.isNaN(updatedAt.getTime())) {
        return { kind: "updated", updatedAt, id: parsed.id };
      }
    }
  } catch {
    // Plain rule IDs were used before the assistant cursor carried update time.
  }
  return { kind: "legacy", id: cursor };
}

function cursorWhere(cursor: AssistantCursor | null) {
  if (!cursor) return {};
  if (cursor.kind === "legacy") return { id: { gt: cursor.id } };
  return {
    OR: [
      { updatedAt: { gt: cursor.updatedAt } },
      { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
    ],
  };
}

function encodeAssistantCursor(row: { updatedAt: Date; id: string }) {
  return JSON.stringify({ updatedAt: row.updatedAt.toISOString(), id: row.id });
}
