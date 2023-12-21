import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { gmail_v1 } from "googleapis";
import { getGmailClient } from "@/utils/gmail/client";
import { withError } from "@/utils/middleware";

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
    email: string;
    gmail: gmail_v1.Gmail;
  } & StatsByDayQuery,
) {
  // const { email } = options;

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
      let count: number | undefined = undefined;

      if (typeof count !== "number") {
        const query = getQuery(options.type, date);

        const messages = await options.gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: 500,
        });

        count = messages.data.messages?.length || 0;
        // does this work better when we have more than 500 results?
        // count = messages.data.resultSizeEstimate
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
  const startOfDayInSeconds = Math.floor(date.getTime() / 1000);
  const endOfDayInSeconds = startOfDayInSeconds + 86400;

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

export const GET = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json<{ error: string }>({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const query = statsByDayQuery.parse({ type });

  const gmail = getGmailClient(session);

  const result = await getPastSevenDayStats({
    ...query,
    email: session.user.email,
    gmail,
  });

  return NextResponse.json(result);
});
