import { z } from "zod";
import { NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { withEmailAccount } from "@/utils/middleware";
import { dateToSeconds } from "@/utils/date";
import { getMessages } from "@/utils/gmail/message";
import { getGmailClientForEmail } from "@/utils/account";

const statsByDayQuery = z.object({
  type: z.enum(["inbox", "sent", "archived"]),
});
export type StatsByDayQuery = z.infer<typeof statsByDayQuery>;
export type StatsByDayResponse = Awaited<
  ReturnType<typeof getPastSevenDayStats>
>;

const DAYS = 7;

async function getPastSevenDayStats(
  options: {
    emailAccountId: string;
    gmail: gmail_v1.Gmail;
  } & StatsByDayQuery,
) {
  const today = new Date();
  const sevenDaysAgo = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - (DAYS - 1), // include today in stats
  );
  // const cachedStats = await getAllStats({ email })

  const lastSevenDaysCountsArray = await Promise.all(
    Array.from({ length: DAYS }, (_, i) => {
      const date = new Date(sevenDaysAgo);
      date.setDate(date.getDate() + i);
      return date;
    }).map(async (date) => {
      const dateString = `${date.getDate()}/${date.getMonth() + 1}`;

      // let count = cachedStats?.[dateString]
      let count: number | undefined;

      if (typeof count !== "number") {
        const query = getQuery(options.type, date);

        const messages = await getMessages(options.gmail, {
          query,
          maxResults: 500,
        });

        count = messages.messages?.length || 0;
      }

      return {
        date: dateString,
        Emails: count,
      };
    }),
  );

  return lastSevenDaysCountsArray;
}

function getQuery(type: StatsByDayQuery["type"], date: Date) {
  const startOfDayInSeconds = dateToSeconds(date);
  const endOfDayInSeconds = startOfDayInSeconds + 86_400;

  const dateRange = `after:${startOfDayInSeconds} before:${endOfDayInSeconds}`;

  switch (type) {
    case "inbox":
      return `in:inbox ${dateRange}`;
    case "sent":
      return `in:sent ${dateRange}`;
    case "archived":
      return `-in:inbox -in:sent ${dateRange}`;
  }
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const query = statsByDayQuery.parse({ type });

  const gmail = await getGmailClientForEmail({ emailAccountId });

  const result = await getPastSevenDayStats({
    ...query,
    gmail,
    emailAccountId,
  });

  return NextResponse.json(result);
});
