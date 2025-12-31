import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { CONVERSATION_STATUS_TYPES } from "@/utils/reply-tracker/conversation-status-config";

export type GetSetupProgressResponse = Awaited<
  ReturnType<typeof getSetupProgress>
>;

export const GET = withEmailAccount("user/setup-progress", async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getSetupProgress({ emailAccountId });
  return NextResponse.json(result);
});

async function getSetupProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const [emailAccount, enabledConversationStatusRulesCount] = await Promise.all(
    [
      prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          rules: { select: { id: true }, take: 1 },
          newsletters: {
            where: { status: { not: null } },
            take: 1,
          },
          calendarConnections: { select: { id: true }, take: 1 },
        },
      }),
      // Reply Zero requires ALL conversation status rules (TO_REPLY, FYI,
      // AWAITING_REPLY, ACTIONED) to be enabled. ReplyZeroSection toggles
      // all four in parallel, so we verify all are present and enabled.
      prisma.rule.count({
        where: {
          emailAccountId,
          systemType: { in: CONVERSATION_STATUS_TYPES },
          enabled: true,
        },
      }),
    ],
  );

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  // Reply Zero is only fully enabled when all 4 conversation status rules exist and are enabled
  const isReplyZeroEnabled =
    enabledConversationStatusRulesCount === CONVERSATION_STATUS_TYPES.length;

  const steps = {
    aiAssistant: emailAccount.rules.length > 0,
    replyZero: isReplyZeroEnabled,
    bulkUnsubscribe: emailAccount.newsletters.length > 0,
    calendarConnected: emailAccount.calendarConnections.length > 0,
  };

  const completed = Object.values(steps).filter(Boolean).length;
  const total = Object.keys(steps).length;

  return {
    steps,
    completed,
    total,
    isComplete: completed === total,
  };
}
