import { NextResponse } from "next/server";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { watchEmails } from "@/app/api/google/watch/controller";
import { hasCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";

export const dynamic = "force-dynamic";

export const GET = withError(async (request: Request) => {
  if (!hasCronSecret(request))
    return new Response("Unauthorized", { status: 401 });

  const accounts = await prisma.account.findMany({
    where: {
      user: {
        OR: [
          {
            lemonSqueezyRenewsAt: {
              gt: new Date(),
            },
          },
          {
            openAIApiKey: { not: null },
          },
        ],
      },
    },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
      providerAccountId: true,
      userId: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  console.log(`Watching emails for ${accounts.length} accounts`);

  for (const account of accounts) {
    try {
      console.log(`Watching emails for ${account.user.email}`);

      const gmail = await getGmailClientWithRefresh(
        {
          accessToken: account.access_token!,
          refreshToken: account.refresh_token!,
          expiryDate: account.expires_at,
        },
        account.providerAccountId,
      );

      await watchEmails(account.userId, gmail);
    } catch (error) {
      console.error(`Error for user ${account.userId}`);
      console.error(error);
    }
  }

  return NextResponse.json({ ok: true });
});
