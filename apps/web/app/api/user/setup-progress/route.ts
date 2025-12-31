import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { SystemType } from "@/generated/prisma/enums";

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
  const [emailAccount, replyZeroRule] = await Promise.all([
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
    // TO_REPLY is the canonical indicator for Reply Zero status.
    // ReplyZeroSection toggles all 4 CONVERSATION_STATUS_TYPES together,
    // but TO_REPLY represents the core "needs reply" tracking functionality.
    prisma.rule.findFirst({
      where: {
        emailAccountId,
        systemType: SystemType.TO_REPLY,
        enabled: true,
      },
      select: { id: true },
    }),
  ]);

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const steps = {
    aiAssistant: emailAccount.rules.length > 0,
    replyZero: !!replyZeroRule,
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
