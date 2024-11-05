import { NextResponse } from "next/server";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { watchEmails } from "@/app/api/google/watch/controller";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { hasAiAccess, hasColdEmailAccess } from "@/utils/premium";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function watchAllEmails() {
  const premiums = await prisma.premium.findMany({
    where: {
      lemonSqueezyRenewsAt: { gt: new Date() },
    },
    select: {
      tier: true,
      coldEmailBlockerAccess: true,
      aiAutomationAccess: true,
      users: {
        select: {
          id: true,
          email: true,
          aiApiKey: true,
          watchEmailsExpirationDate: true,
          accounts: {
            select: {
              access_token: true,
              refresh_token: true,
              expires_at: true,
              providerAccountId: true,
            },
          },
        },
      },
    },
  });

  const users = premiums.flatMap((premium) =>
    premium.users.map((user) => ({ ...user, premium })),
  );

  console.log(`Watching emails for ${users.length} users`);

  for (const user of users) {
    try {
      console.log(`Watching emails for ${user.email}`);

      const userHasAiAccess = hasAiAccess(
        user.premium.aiAutomationAccess,
        user.aiApiKey,
      );
      const userHasColdEmailAccess = hasColdEmailAccess(
        user.premium.coldEmailBlockerAccess,
        user.aiApiKey,
      );

      if (!userHasAiAccess && !userHasColdEmailAccess) {
        console.log(
          `User ${user.email} does not have access to AI or cold email`,
        );
        if (
          user.watchEmailsExpirationDate &&
          new Date(user.watchEmailsExpirationDate) < new Date()
        ) {
          prisma.user.update({
            where: { id: user.id },
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

      const account = user.accounts[0];

      if (!account.access_token || !account.refresh_token) {
        console.log(`User ${user.email} has no access token or refresh token`);
        continue;
      }

      const gmail = await getGmailClientWithRefresh(
        {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiryDate: account.expires_at,
        },
        account.providerAccountId,
      );

      // couldn't refresh the token
      if (!gmail) continue;

      await watchEmails(user.id, gmail);
    } catch (error) {
      console.error(`Error for user ${user.id}`);
      console.error(error);
    }
  }

  return NextResponse.json({ success: true });
}

export const GET = withError(async (request: Request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized cron request: api/google/watch/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails();
});

export const POST = withError(async (request: Request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/google/watch/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails();
});
