import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { getEmailProviderRateLimitState } from "@/utils/email/rate-limit";
import type { Logger } from "@/utils/logger";
import { resolveSensitiveDataPolicy } from "@/utils/dlp/policy.server";

export type EmailAccountFullResponse = Awaited<
  ReturnType<typeof getEmailAccount>
> | null;

async function getEmailAccount({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
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
      sensitiveDataPolicy: true,
      draftReplyConfidence: true,
      allowHiddenAiDraftLinks: true,
      timezone: true,
      calendarBookingLink: true,
      signature: true,
      includeReferralSignature: true,
      writingStyle: true,
      filingEnabled: true,
      filingPrompt: true,
      filingConfirmationSendEmail: true,
      followUpAwaitingReplyDays: true,
      followUpNeedsReplyDays: true,
      followUpAutoDraftEnabled: true,
      digestSendEmail: true,
    },
  });

  if (!emailAccount) throw new SafeError("Email account not found");

  const providerRateLimit = await getEmailProviderRateLimitState({
    emailAccountId,
    logger,
  });
  return {
    ...emailAccount,
    sensitiveDataPolicy: resolveSensitiveDataPolicy(
      emailAccount.sensitiveDataPolicy,
    ),
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

    const emailAccount = await getEmailAccount({
      emailAccountId,
      logger: request.logger,
    });

    return NextResponse.json(emailAccount);
  },
  { allowOrgAdmins: true },
);
