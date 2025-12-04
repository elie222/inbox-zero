import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

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
  const [emailAccount, emailCount, executedRulesCount, inboxEmailCount] =
    await Promise.all([
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
      prisma.emailMessage.count({
        where: { emailAccountId },
      }),
      prisma.executedRule.count({
        where: { emailAccountId },
      }),
      prisma.emailMessage.count({
        where: { emailAccountId, inbox: true },
      }),
    ]);

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const steps = {
    aiAssistant: emailAccount.rules.length > 0,
    bulkUnsubscribe: emailAccount.newsletters.length > 0,
    calendarConnected: emailAccount.calendarConnections.length > 0,
  };

  const completed = Object.values(steps).filter(Boolean).length;
  const total = Object.keys(steps).length;

  // Calculate inbox coverage: percentage of emails that have been handled (archived)
  const inboxCoverage =
    emailCount > 0
      ? Math.round(((emailCount - inboxEmailCount) / emailCount) * 100)
      : 0;

  return {
    steps,
    completed,
    total,
    isComplete: completed === total,
    emailsProcessed: emailCount,
    rulesExecuted: executedRulesCount,
    inboxCoverage,
  };
}
