import type { gmail_v1 } from "@googleapis/gmail";
import { NextResponse } from "next/server";
import { dateToSeconds } from "@/utils/date";
import { getMessages } from "@/utils/gmail/message";
import { getGmailClientForEmailId } from "@/utils/account";
import { withEmailAccount } from "@/utils/middleware";

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

  const twentyFourHoursAgoInSeconds = dateToSeconds(twentyFourHoursAgo);
  const sevenDaysAgoInSeconds = dateToSeconds(sevenDaysAgo);

  const [
    emailsReceived24hrs,
    emailsSent24hrs,
    emailsInbox24hrs,
    emailsReceived7days,
    emailsSent7days,
    emailsInbox7days,
  ] = await Promise.all([
    getMessages(gmail, {
      query: `-in:sent after:${twentyFourHoursAgoInSeconds}`,
      maxResults: 500,
    }),
    getMessages(gmail, {
      query: `in:sent after:${twentyFourHoursAgoInSeconds}`,
      maxResults: 500,
    }),
    getMessages(gmail, {
      query: `in:inbox after:${twentyFourHoursAgoInSeconds}`,
      maxResults: 500,
    }),

    // 7 days
    getMessages(gmail, {
      query: `-in:sent after:${sevenDaysAgoInSeconds}`,
      maxResults: 500,
    }),
    getMessages(gmail, {
      query: `in:sent after:${sevenDaysAgoInSeconds}`,
      maxResults: 500,
    }),
    getMessages(gmail, {
      query: `in:inbox after:${sevenDaysAgoInSeconds}`,
      maxResults: 500,
    }),
  ]);

  return {
    emailsSent24hrs: emailsSent24hrs.messages?.length,
    emailsReceived24hrs: emailsReceived24hrs.messages?.length,
    emailsInbox24hrs: emailsInbox24hrs.messages?.length,

    emailsSent7days: emailsSent7days.messages?.length,
    emailsReceived7days: emailsReceived7days.messages?.length,
    emailsInbox7days: emailsInbox7days.messages?.length,
  };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const gmail = await getGmailClientForEmailId({ emailAccountId });
  const result = await getStats({ gmail });

  return NextResponse.json(result);
});
