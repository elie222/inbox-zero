import prisma from "@/utils/prisma";

export type ChatActionTotals = Record<string, number>;

// Adds this call's counts to the chat's running totals and returns every total
// for the chat, so the newest tool result always carries the exact figures.
// Totals are read after the increments commit, so of two parallel calls the
// later reader sees both.
export async function addChatActionTotals({
  chatId,
  counts,
}: {
  chatId: string;
  counts: ChatActionTotals;
}): Promise<ChatActionTotals> {
  const increments = Object.entries(counts).filter(([, count]) => count > 0);

  if (increments.length) {
    await prisma.$transaction(
      increments.map(([action, count]) =>
        prisma.chatActionTotal.upsert({
          where: { chatId_action: { chatId, action } },
          create: { chatId, action, count },
          update: { count: { increment: count } },
          select: { id: true },
        }),
      ),
    );
  }

  const rows = await prisma.chatActionTotal.findMany({
    where: { chatId },
    select: { action: true, count: true },
    orderBy: { action: "asc" },
  });

  return toChatActionTotals(rows);
}

export function toChatActionTotals(
  rows: { action: string; count: number }[],
): ChatActionTotals {
  return Object.fromEntries(
    rows.filter((row) => row.count > 0).map((row) => [row.action, row.count]),
  );
}
