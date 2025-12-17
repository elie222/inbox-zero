import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { hasAiAccess, getPremiumUserFilter } from "@/utils/premium";
import { createManagedOutlookSubscription } from "@/utils/outlook/subscription-manager";
import type { Logger } from "@/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = withError("outlook/watch/all", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized cron request: api/outlook/watch/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails(request.logger);
});

export const POST = withError("outlook/watch/all", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/outlook/watch/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails(request.logger);
});

async function watchAllEmails(logger: Logger) {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      account: {
        provider: "microsoft",
      },
      ...getPremiumUserFilter(),
    },
    select: {
      id: true,
      email: true,
      watchEmailsExpirationDate: true,
      account: {
        select: {
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
      user: {
        select: {
          aiApiKey: true,
          premium: { select: { tier: true } },
        },
      },
    },
    orderBy: {
      watchEmailsExpirationDate: { sort: "asc", nulls: "first" },
    },
  });

  logger.info("Watching email accounts", { count: emailAccounts.length });

  for (const emailAccount of emailAccounts) {
    try {
      logger.info("Watching emails for account", {
        emailAccountId: emailAccount.id,
        email: emailAccount.email,
      });

      const userHasAiAccess = hasAiAccess(
        emailAccount.user.premium?.tier || null,
        emailAccount.user.aiApiKey,
      );

      if (!userHasAiAccess) {
        logger.info("User does not have access to AI", {
          email: emailAccount.email,
        });
        if (
          emailAccount.watchEmailsExpirationDate &&
          new Date(emailAccount.watchEmailsExpirationDate) < new Date()
        ) {
          await prisma.emailAccount.update({
            where: { email: emailAccount.email },
            data: {
              watchEmailsExpirationDate: null,
              watchEmailsSubscriptionId: null,
            },
          });
        }

        continue;
      }

      if (
        !emailAccount.account?.access_token ||
        !emailAccount.account?.refresh_token
      ) {
        logger.info("User has no access token or refresh token", {
          email: emailAccount.email,
        });
        continue;
      }

      await createManagedOutlookSubscription(emailAccount.id);
    } catch (error) {
      if (error instanceof Error) {
        const warn = [
          "invalid_grant",
          "Mail service not enabled",
          "Insufficient Permission",
        ];

        if (warn.some((w) => error.message.includes(w))) {
          logger.warn("Not watching emails for user", {
            email: emailAccount.email,
            error,
          });
          continue;
        }
      }

      logger.error("Error for user", { email: emailAccount.email, error });
    }
  }

  return NextResponse.json({ success: true });
}
