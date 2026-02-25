import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { getEmailProviderRateLimitState } from "@/utils/email/rate-limit";

export type EmailAccountFullResponse = Awaited<
  ReturnType<typeof getEmailAccount>
> | null;

async function getEmailAccount({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      digestSchedule: true,
      userId: true,
      about: true,
      multiRuleSelectionEnabled: true,
      timezone: true,
      calendarBookingLink: true,
      signature: true,
      includeReferralSignature: true,
      writingStyle: true,
      filingEnabled: true,
      filingPrompt: true,
      followUpAwaitingReplyDays: true,
      followUpNeedsReplyDays: true,
      followUpAutoDraftEnabled: true,
    },
  });

  if (!emailAccount) throw new SafeError("Email account not found");

  const providerRateLimit = await getEmailProviderRateLimitState({
    emailAccountId,
  });

  return {
    ...emailAccount,
    providerRateLimit: providerRateLimit
      ? {
          provider: providerRateLimit.provider,
          retryAt: providerRateLimit.retryAt.toISOString(),
          source: providerRateLimit.source,
        }
      : null,
  };
}

export const GET = withEmailAccount(
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;

    const emailAccount = await getEmailAccount({ emailAccountId });

    return NextResponse.json(emailAccount);
  },
  { allowOrgAdmins: true },
);
