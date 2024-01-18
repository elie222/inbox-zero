import { NextResponse } from "next/server";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { watchEmails } from "@/app/api/google/watch/controller";
import { hasCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = withError(async (request: Request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized cron request: api/google/watch/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const premiums = await prisma.premium.findMany({
    where: {
      lemonSqueezyRenewsAt: { gt: new Date() },
    },
    select: {
      tier: true,
      users: {
        select: {
          id: true,
          email: true,
          openAIApiKey: true,
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

  const users = premiums.flatMap((premium) => premium.users);

  console.log(`Watching emails for ${users.length} users`);

  for (const user of users) {
    try {
      console.log(`Watching emails for ${user.email}`);

      const account = user.accounts[0];

      const gmail = await getGmailClientWithRefresh(
        {
          accessToken: account.access_token!,
          refreshToken: account.refresh_token!,
          expiryDate: account.expires_at,
        },
        account.providerAccountId,
      );

      await watchEmails(user.id, gmail);
    } catch (error) {
      console.error(`Error for user ${user.id}`);
      console.error(error);
    }
  }

  return NextResponse.json({ success: true });
});
