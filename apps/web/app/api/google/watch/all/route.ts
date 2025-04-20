import { NextResponse } from "next/server";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { watchEmails } from "@/app/api/google/watch/controller";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { hasAiAccess, hasColdEmailAccess } from "@/utils/premium";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("api/google/watch/all");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function watchAllEmails() {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      user: {
        premium: {
          lemonSqueezyRenewsAt: { gt: new Date() },
        },
      },
    },
    select: {
      email: true,
      aiApiKey: true,
      watchEmailsExpirationDate: true,
      account: {
        select: {
          access_token: true,
          refresh_token: true,
          expires_at: true,
          providerAccountId: true,
        },
      },
      user: {
        select: {
          premium: {
            select: {
              aiAutomationAccess: true,
              coldEmailBlockerAccess: true,
            },
          },
        },
      },
    },
  });

  logger.info("Watching emails for users", {
    count: emailAccounts.length,
  });

  const sortedEmailAccounts = emailAccounts.sort((a, b) => {
    // Prioritize null dates first
    if (!a.watchEmailsExpirationDate && b.watchEmailsExpirationDate) return -1;
    if (a.watchEmailsExpirationDate && !b.watchEmailsExpirationDate) return 1;

    // If both have dates, sort by earliest date first
    if (a.watchEmailsExpirationDate && b.watchEmailsExpirationDate) {
      return (
        new Date(a.watchEmailsExpirationDate).getTime() -
        new Date(b.watchEmailsExpirationDate).getTime()
      );
    }

    return 0;
  });

  for (const emailAccount of sortedEmailAccounts) {
    try {
      logger.info("Watching emails for user", { email: emailAccount.email });

      const userHasAiAccess = hasAiAccess(
        emailAccount.user.premium?.aiAutomationAccess,
        emailAccount.aiApiKey,
      );
      const userHasColdEmailAccess = hasColdEmailAccess(
        emailAccount.user.premium?.coldEmailBlockerAccess,
        emailAccount.aiApiKey,
      );

      if (!userHasAiAccess && !userHasColdEmailAccess) {
        logger.info("User does not have access to AI or cold email", {
          email: emailAccount.email,
        });
        if (
          emailAccount.watchEmailsExpirationDate &&
          new Date(emailAccount.watchEmailsExpirationDate) < new Date()
        ) {
          await prisma.emailAccount.update({
            where: { email: emailAccount.email },
            data: { watchEmailsExpirationDate: null },
          });
        }

        continue;
      }

      // if (
      //   user.watchEmailsExpirationDate &&
      //   new Date(user.watchEmailsExpirationDate) > addDays(new Date(), 2)
      // ) {
      //   console.log(
      //     `User ${user.email} already has a watchEmailsExpirationDate set to: ${user.watchEmailsExpirationDate}`,
      //   );
      //   continue;
      // }

      if (
        !emailAccount.account?.access_token ||
        !emailAccount.account?.refresh_token
      ) {
        logger.info("User has no access token or refresh token", {
          email: emailAccount.email,
        });
        continue;
      }

      const gmail = await getGmailClientWithRefresh(
        {
          accessToken: emailAccount.account.access_token,
          refreshToken: emailAccount.account.refresh_token,
          expiryDate: emailAccount.account.expires_at,
        },
        emailAccount.account.providerAccountId,
      );

      // couldn't refresh the token
      if (!gmail) continue;

      await watchEmails({ email: emailAccount.email, gmail });
    } catch (error) {
      logger.error("Error for user", { userId: emailAccount.email, error });
    }
  }

  return NextResponse.json({ success: true });
}

export const GET = withError(async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized cron request: api/google/watch/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails();
});

export const POST = withError(async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/google/watch/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails();
});
