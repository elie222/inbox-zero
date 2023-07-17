import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getClient } from "@/utils/google";
import prisma from "@/utils/prisma";
import { watchEmails } from "@/app/api/google/watch/controller";

export async function GET() {
  const accounts = await prisma.account.findMany({
    select: { access_token: true, refresh_token: true, userId: true },
  });

  for (const account of accounts) {
    try {
      console.log(account.userId);
      const auth = getClient({
        accessToken: account.access_token ?? undefined,
        refreshToken: account.refresh_token ?? undefined,
      });
      const gmail = google.gmail({ version: "v1", auth });

      await watchEmails(account.userId, gmail);
    } catch (error) {
      console.error(`Error for user ${account.userId}`);
    }
  }

  return NextResponse.json({ ok: true });
}
