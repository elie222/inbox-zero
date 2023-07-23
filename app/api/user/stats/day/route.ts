import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { gmail_v1 } from "googleapis";
import { getGmailClient } from "@/utils/google";

export type StatsByDayResponse = Awaited<
  ReturnType<typeof getPastSevenDayStats>
>;

const DAYS = 7;

async function getPastSevenDayStats(options: {
  email: string;
  gmail: gmail_v1.Gmail;
}) {
  // const { email } = options;

  const today = new Date();
  const sevenDaysAgo = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - (DAYS - 1) // include today in stats
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
        const startOfDayInSeconds = Math.floor(date.getTime() / 1000);
        const endOfDayInSeconds = startOfDayInSeconds + 86400;

        const messages = await options.gmail.users.messages.list({
          userId: "me",
          q: `in:inbox after:${startOfDayInSeconds} before:${endOfDayInSeconds}`,
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
    })
  );

  return lastSevenDaysCountsArray;
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);

  const result = await getPastSevenDayStats({
    email: session.user.email,
    gmail,
  });

  return NextResponse.json(result);
}
