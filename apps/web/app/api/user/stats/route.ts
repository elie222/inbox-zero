import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import type { EmailProvider } from "@/utils/email/types";

export type StatsResponse = Awaited<ReturnType<typeof getStats>>;

async function getStats({ emailProvider }: { emailProvider: EmailProvider }) {
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

  const [
    emailsReceived24hrs,
    emailsSent24hrs,
    emailsInbox24hrs,
    emailsReceived7days,
    emailsSent7days,
    emailsInbox7days,
  ] = await Promise.all([
    emailProvider.getMessagesByFields({
      after: twentyFourHoursAgo,
      excludeSent: true,
      maxResults: 500,
    }),
    emailProvider.getMessagesByFields({
      after: twentyFourHoursAgo,
      type: "sent",
      maxResults: 500,
    }),
    emailProvider.getMessagesByFields({
      after: twentyFourHoursAgo,
      type: "inbox",
      maxResults: 500,
    }),

    // 7 days
    emailProvider.getMessagesByFields({
      after: sevenDaysAgo,
      excludeSent: true,
      maxResults: 500,
    }),
    emailProvider.getMessagesByFields({
      after: sevenDaysAgo,
      type: "sent",
      maxResults: 500,
    }),
    emailProvider.getMessagesByFields({
      after: sevenDaysAgo,
      type: "inbox",
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

export const GET = withEmailProvider("user/stats", async (request) => {
  const result = await getStats({ emailProvider: request.emailProvider });

  return NextResponse.json(result);
});
