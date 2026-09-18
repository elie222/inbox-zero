import prisma from "@/utils/prisma";
import type { AssistantStatePage } from "@inboxzero/mail-core/ports/assistant-source";

export async function readAssistantStatePage(input: {
  emailAccountId: string;
  cursor: string | null;
  pageSize?: number;
}): Promise<Omit<AssistantStatePage, "session">> {
  const pageSize = input.pageSize ?? 50;
  const rows = await prisma.executedRule.findMany({
    where: {
      emailAccountId: input.emailAccountId,
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: pageSize,
    select: {
      id: true,
      createdAt: true,
      messageId: true,
      threadId: true,
      status: true,
      actionItems: {
        select: { id: true, type: true, executionStatus: true },
      },
    },
  });
  const entries = rows.flatMap((row) =>
    row.actionItems.length > 0
      ? row.actionItems.map((action) => ({
          id: `${row.id}:${action.id}`,
          revision: row.createdAt.toISOString(),
          messageId: row.messageId,
          conversationId: row.threadId,
          kind: action.type,
          payload: {
            executedRuleId: row.id,
            status: row.status,
            executionStatus: action.executionStatus,
          },
        }))
      : [
          {
            id: row.id,
            revision: row.createdAt.toISOString(),
            messageId: row.messageId,
            conversationId: row.threadId,
            kind: row.status,
            payload: { executedRuleId: row.id, status: row.status },
          },
        ],
  );
  const last = rows.at(-1);
  return {
    cursor: input.cursor,
    nextCursor: last && rows.length === pageSize ? last.id : null,
    reset: false,
    entries,
  };
}
