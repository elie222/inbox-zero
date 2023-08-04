import { NextResponse } from "next/server";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { watchEmails } from "@/app/api/google/watch/controller";

export const dynamic = "force-dynamic";

export async function GET() {
  const accounts = await prisma.account.findMany({
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
      providerAccountId: true,
      userId: true,
    },
  });

  for (const account of accounts) {
    try {
      console.log(account.userId);

      const gmail = await getGmailClientWithRefresh(
        {
          accessToken: account.access_token!,
          refreshToken: account.refresh_token!,
          expiryDate: account.expires_at,
        },
        account.providerAccountId
      );

      await watchEmails(account.userId, gmail);
    } catch (error) {
      console.error(`Error for user ${account.userId}`);
      console.error(error);
    }
  }

  return NextResponse.json({ ok: true });
}
