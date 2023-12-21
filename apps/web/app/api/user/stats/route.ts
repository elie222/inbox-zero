import { gmail_v1 } from "googleapis";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { withError } from "@/utils/middleware";

export type StatsResponse = Awaited<ReturnType<typeof getStats>>;

async function getStats(options: { gmail: gmail_v1.Gmail }) {
  const { gmail } = options;

  const now = new Date();
  const twentyFourHoursAgo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  const sevenDaysAgo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 7,
  );

  const twentyFourHoursAgoInSeconds = Math.floor(
    twentyFourHoursAgo.getTime() / 1000,
  );
  const sevenDaysAgoInSeconds = Math.floor(sevenDaysAgo.getTime() / 1000);

  const [
    emailsReceived24hrs,
    emailsSent24hrs,
    emailsInbox24hrs,
    emailsReceived7days,
    emailsSent7days,
    emailsInbox7days,
  ] = await Promise.all([
    gmail.users.messages.list({
      userId: "me",
      q: `-in:sent after:${twentyFourHoursAgoInSeconds}`,
      maxResults: 500,
    }),
    gmail.users.messages.list({
      userId: "me",
      q: `in:sent after:${twentyFourHoursAgoInSeconds}`,
      maxResults: 500,
    }),
    gmail.users.messages.list({
      userId: "me",
      q: `in:inbox after:${twentyFourHoursAgoInSeconds}`,
      maxResults: 500,
    }),

    // 7 days
    gmail.users.messages.list({
      userId: "me",
      q: `-in:sent after:${sevenDaysAgoInSeconds}`,
      maxResults: 500,
    }),
    gmail.users.messages.list({
      userId: "me",
      q: `in:sent after:${sevenDaysAgoInSeconds}`,
      maxResults: 500,
    }),
    gmail.users.messages.list({
      userId: "me",
      q: `in:inbox after:${sevenDaysAgoInSeconds}`,
      maxResults: 500,
    }),
  ]);

  return {
    emailsSent24hrs: emailsSent24hrs.data.messages?.length,
    emailsReceived24hrs: emailsReceived24hrs.data.messages?.length,
    emailsInbox24hrs: emailsInbox24hrs.data.messages?.length,

    emailsSent7days: emailsSent7days.data.messages?.length,
    emailsReceived7days: emailsReceived7days.data.messages?.length,
    emailsInbox7days: emailsInbox7days.data.messages?.length,
  };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const result = await getStats({ gmail });

  return NextResponse.json(result);
});
