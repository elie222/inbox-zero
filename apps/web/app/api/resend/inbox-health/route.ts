import { NextResponse } from "next/server";
import { subMonths } from "date-fns/subMonths";
import { sendInboxHealthEmail } from "@inboxzero/transactional-email";
import { withEmailAccount, withError } from "@/utils/middleware";
import { env } from "@/env";
import { isAuthorizedCronOrInternalRequest } from "@/utils/cron";
import { captureException } from "@/utils/error";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { getSenderEmailStats } from "@/utils/sender-stats";
import {
  findAutoArchiveFilters,
  findNewsletterStatus,
  getEmailFilters,
  getNewsletterStatuses,
} from "@/utils/senders/filters";
import {
  canonicalizeEmailAddress,
  getNewsletterSenderDisplayName,
} from "@/utils/email";
import { createEmailProvider } from "@/utils/email/provider";
import { classifyEmailAccountProviderIssue } from "@/utils/email/provider-health";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { sendInboxHealthEmailBody } from "./validation";
import { getInboxHealthEmailData, getInboxHealthSkipReason } from "./helpers";

export const maxDuration = 60;

export const GET = withEmailAccount("resend/inbox-health", async (request) => {
  // send to self
  const emailAccountId = request.auth.emailAccountId;

  request.logger.info("Sending inbox health email to user GET", {
    emailAccountId,
  });

  const result = await sendEmail({
    emailAccountId,
    force: true,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

export const POST = withError("resend/inbox-health", async (request) => {
  const logger = request.logger;
  if (!isAuthorizedCronOrInternalRequest(request)) {
    logger.error("Unauthorized cron request");
    captureException(new Error("Unauthorized cron request: resend"));
    return new Response("Unauthorized", { status: 401 });
  }

  const json = await request.json();
  const { success, data, error } = sendInboxHealthEmailBody.safeParse(json);

  if (!success) {
    logger.error("Invalid request body", { error });
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const { emailAccountId } = data;

  logger.info("Sending inbox health email to user POST", { emailAccountId });

  try {
    await sendEmail({ emailAccountId, logger });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error sending inbox health email", { error });
    captureException(error);
    return NextResponse.json(
      { success: false, error: "Error sending inbox health email" },
      { status: 500 },
    );
  }
});

async function sendEmail({
  emailAccountId,
  force,
  logger,
}: {
  emailAccountId: string;
  force?: boolean;
  logger: Logger;
}) {
  logger = logger.with({ emailAccountId, force });

  logger.info("Sending inbox health email");

  const now = new Date();

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      userId: true,
      email: true,
      createdAt: true,
      statsEmailFrequency: true,
      lastInboxHealthEmailAt: true,
      account: {
        select: {
          provider: true,
          refresh_token: true,
        },
      },
    },
  });

  if (!emailAccount) {
    logger.error("Email account not found");
    return { success: false };
  }

  logger = logger.with({ userId: emailAccount.userId });

  if (!force) {
    const skipReason = getInboxHealthSkipReason({
      statsEmailFrequency: emailAccount.statsEmailFrequency,
      createdAt: emailAccount.createdAt,
      lastInboxHealthEmailAt: emailAccount.lastInboxHealthEmailAt,
      now,
    });

    if (skipReason) {
      logger.info("Skipping inbox health email", { skipReason });
      return { success: true, skipped: skipReason };
    }
  }

  if (!emailAccount.account.refresh_token) {
    logger.warn("Skipping inbox health email: account has no refresh token");
    await startNextInboxHealthWindow(emailAccountId);
    return { success: false, message: "Account has no refresh token" };
  }

  let emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
  try {
    emailProvider = await createEmailProvider({
      emailAccountId,
      provider: emailAccount.account.provider,
      logger,
    });
  } catch (error) {
    const provider = emailAccount.account.provider;

    if (!isGoogleProvider(provider) && !isMicrosoftProvider(provider))
      throw error;

    const issue = classifyEmailAccountProviderIssue({ error, provider });
    if (!issue) throw error;

    logger.warn("Skipping inbox health email: provider action required", {
      provider,
      reason: issue.reason,
    });
    await startNextInboxHealthWindow(emailAccountId);
    return { success: false, skipped: "provider action required" };
  }

  const [senderStats, newsletterStatuses, emailFilters] = await Promise.all([
    getSenderEmailStats({
      emailAccountId,
      fromDate: subMonths(now, 3).getTime(),
      logger,
    }),
    getNewsletterStatuses({ emailAccountId }),
    getEmailFilters(emailProvider, logger),
  ]);

  const senders = senderStats.map((stats) => {
    const email = canonicalizeEmailAddress(stats.from);
    return {
      name: email,
      fromName: getNewsletterSenderDisplayName({
        email,
        fromName: stats.fromName,
        minFromName: stats.minFromName,
        maxFromName: stats.fromName,
      }),
      value: stats.count,
      readEmails: stats.readEmails,
      autoArchived: findAutoArchiveFilters(
        emailFilters,
        email,
        emailProvider,
      )[0],
      status: findNewsletterStatus(newsletterStatuses, email),
    };
  });

  const emailData = getInboxHealthEmailData(senders);

  if (!emailData) {
    logger.info("Not enough unsubscribe suggestions, skipping", {
      senderCount: senders.length,
    });
    await startNextInboxHealthWindow(emailAccountId);
    return { success: true, skipped: "not enough suggestions" };
  }

  logger.info("Sending inbox health email to user", {
    suggestionCount: emailData.suggestionCount,
    yearlyEmailsAvoided: emailData.yearlyEmailsAvoided,
  });

  const token = await createUnsubscribeToken({ emailAccountId });

  await sendInboxHealthEmail({
    from: env.RESEND_FROM_EMAIL,
    to: emailAccount.email,
    emailProps: {
      baseUrl: env.NEXT_PUBLIC_BASE_URL,
      emailAccountId,
      unsubscribeToken: token,
      ...emailData,
    },
  });

  await startNextInboxHealthWindow(emailAccountId);

  return { success: true };
}

/**
 * Bump the timestamp on skips as well as sends, so the daily fan-out doesn't
 * re-enqueue the account (and re-run the expensive stats query) until the next
 * window.
 */
function startNextInboxHealthWindow(emailAccountId: string) {
  return prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { lastInboxHealthEmailAt: new Date() },
  });
}
