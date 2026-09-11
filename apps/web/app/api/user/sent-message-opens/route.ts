import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const threadIdSchema = z.string().min(1).max(512);
const MAX_THREAD_IDS = 100;

export type GetSentMessageOpensResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(
  "user/sent-message-opens",
  async (request) => {
    const threadId = request.nextUrl.searchParams.get("threadId");
    const threadIdsParam = request.nextUrl.searchParams.get("threadIds");
    const threadIds = threadId
      ? [threadId]
      : (threadIdsParam?.split(",").filter(Boolean) ?? []);

    if (threadIds.length === 0) {
      return NextResponse.json(
        { error: "Thread ID is required" },
        { status: 400 },
      );
    }
    if (threadIds.length > MAX_THREAD_IDS) {
      return NextResponse.json(
        { error: "Too many thread IDs" },
        { status: 400 },
      );
    }

    const parsed = z.array(threadIdSchema).safeParse(threadIds);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid thread ID" }, { status: 400 });
    }

    return NextResponse.json(
      await getData(request.auth.emailAccountId, parsed.data),
    );
  },
);

async function getData(emailAccountId: string, threadIds: string[]) {
  const rows = await prisma.sentMessageOpen.findMany({
    where: {
      emailAccountId,
      threadId: { in: threadIds },
      messageId: { not: null },
    },
    select: {
      messageId: true,
      threadId: true,
      firstOpenedAt: true,
      lastOpenedAt: true,
      openCount: true,
    },
  });

  const opens: Record<
    string,
    {
      messageId: string;
      threadId: string | null;
      firstOpenedAt: string | null;
      lastOpenedAt: string | null;
      openCount: number;
    }
  > = {};

  for (const row of rows) {
    if (!row.messageId) continue;
    opens[row.messageId] = {
      messageId: row.messageId,
      threadId: row.threadId,
      firstOpenedAt: row.firstOpenedAt?.toISOString() ?? null,
      lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
      openCount: row.openCount,
    };
  }

  return { opens };
}
