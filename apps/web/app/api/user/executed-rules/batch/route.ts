import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const batchRequestSchema = z.object({ messageIds: z.array(z.string()) });

export type BatchExecutedRulesResponse = Awaited<ReturnType<typeof getData>>;

async function getData({
  emailAccountId,
  messageIds,
}: {
  emailAccountId: string;
  messageIds: string[];
}) {
  const executedRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      messageId: { in: messageIds },
    },
    select: {
      id: true,
      messageId: true,
      threadId: true,
      reason: true,
      actionItems: true,
      rule: true,
      status: true,
    },
    orderBy: { id: "asc" },
  });

  // Convert to a map for easy lookup by messageId
  const rulesMap: Record<string, (typeof executedRules)[0]> = {};

  for (const executedRule of executedRules) {
    rulesMap[executedRule.messageId] = executedRule;
  }

  return { rulesMap };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);

  const parsed = batchRequestSchema.safeParse({
    messageIds: searchParams.get("messageIds")?.split(",") || [],
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await getData({
    emailAccountId,
    messageIds: parsed.data.messageIds,
  });
  return NextResponse.json(result);
});
