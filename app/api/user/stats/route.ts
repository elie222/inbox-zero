import { gmail_v1 } from "googleapis";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/google";

export type StatsResponse = Awaited<ReturnType<typeof getStats>>;

async function getStats(options: { gmail: gmail_v1.Gmail }) {
  const { gmail } = options;

  const now = new Date();
  const twentyFourHoursAgo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1
  );

  const twentyFourHoursAgoInSeconds = Math.floor(
    twentyFourHoursAgo.getTime() / 1000
  );

  const [emailsSent24hrs, emailsReceived24hrs, emailsArchived24hrs] =
    await Promise.all([
      gmail.users.messages.list({
        userId: "me",
        q: `q=in:sent after:${twentyFourHoursAgoInSeconds}`,
        maxResults: 500,
      }),
      // does this include sent?
      gmail.users.messages.list({
        userId: "me",
        q: `after:${twentyFourHoursAgoInSeconds}`,
        maxResults: 500,
      }),
      gmail.users.messages.list({
        userId: "me",
        q: `in:archive after:${twentyFourHoursAgoInSeconds}`,
        maxResults: 500,
      }),
    ]);

  return {
    emailsSent24hrs: emailsSent24hrs.data.messages?.length,
    emailsReceived24hrs: emailsReceived24hrs.data.messages?.length,
    emailsArchived24hrs: emailsArchived24hrs.data.messages?.length,
  };
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const result = await getStats({ gmail });

  return NextResponse.json(result);
}
