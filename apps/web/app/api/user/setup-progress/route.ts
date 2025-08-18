import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { cookies } from "next/headers";
import { REPLY_ZERO_ONBOARDING_COOKIE } from "@/utils/cookies";

export type GetSetupProgressResponse = Awaited<
  ReturnType<typeof getSetupProgress>
>;

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getSetupProgress({ emailAccountId });
  return NextResponse.json(result);
});

async function getSetupProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      rules: { select: { id: true }, take: 1 },
      newsletters: {
        where: { status: { not: null } },
        take: 1,
      },
    },
  });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const cookieStore = await cookies();
  const isReplyTrackerConfigured =
    cookieStore.get(REPLY_ZERO_ONBOARDING_COOKIE)?.value === "true";

  const steps = {
    aiAssistant: emailAccount.rules.length > 0,
    bulkUnsubscribe: emailAccount.newsletters.length > 0,
    replyTracker: isReplyTrackerConfigured,
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
