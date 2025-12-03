import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { hasAiAccess, getPremiumUserFilter } from "@/utils/premium";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("api/google/watch/all");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function watchAllEmails() {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
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

      const emailProvider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: "google",
      });

      await emailProvider.watchEmails();
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

export const GET = withError("google/watch/all", async (request) => {
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
