import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { watchEmails } from "../controller";
import { createEmailProvider } from "@/utils/email/provider";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { hasAiAccess } from "@/utils/premium";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("api/watch/all");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function watchAllEmails() {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      user: {
        premium: {
          OR: [
            { lemonSqueezyRenewsAt: { gt: new Date() } },
            { stripeSubscriptionStatus: { in: ["active", "trialing"] } },
          ],
        },
      },
    },
    select: {
      id: true,
      email: true,
      watchEmailsExpirationDate: true,
      watchEmailsSubscriptionId: true,
      account: {
        select: {
          provider: true,
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
        provider: emailAccount.account.provider,
      });

      const userHasAiAccess = hasAiAccess(
        emailAccount.user.premium?.tier || null,
        emailAccount.user.aiApiKey,
      );

      if (!userHasAiAccess) {
        logger.info("User does not have access to AI or cold email", {
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

      const provider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: emailAccount.account.provider,
      });

      const result = await watchEmails({
        emailAccountId: emailAccount.id,
        provider,
      });

      if (!result.success) {
        logger.error("Failed to watch emails for account", {
          emailAccountId: emailAccount.id,
          email: emailAccount.email,
          error: result.error,
        });
      }
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

export const GET = withError(async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized cron request: api/watch/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails();
});

export const POST = withError(async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(new Error("Unauthorized cron request: api/watch/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails();
});
