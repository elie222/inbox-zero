import { z } from "zod";
import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";

const statsByDayQuery = z.object({
  type: z.enum(["inbox", "sent", "archived"]),
});
export type StatsByDayQuery = z.infer<typeof statsByDayQuery>;
export type StatsByDayResponse = Awaited<
  ReturnType<typeof getPastSevenDayStats>
>;

const DAYS = 7;

async function getMessagesByType(
  emailProvider: EmailProvider,
  type: StatsByDayQuery["type"],
  startOfDay: Date,
  endOfDay: Date,
) {
  if (type === "archived") {
    // For archived messages, get all messages excluding inbox and sent
    return emailProvider.getMessagesByFields({
      after: startOfDay,
      before: endOfDay,
      type: "all",
      excludeSent: true,
      excludeInbox: true,
      maxResults: 500,
    });
  } else {
    // For inbox and sent, use the provider's built-in type filtering
    return emailProvider.getMessagesByFields({
      after: startOfDay,
      before: endOfDay,
      type,
      maxResults: 500,
    });
  }
}

async function getPastSevenDayStats({
  emailProvider,
  type,
}: {
  emailProvider: EmailProvider;
} & StatsByDayQuery) {
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
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const { messages } = await getMessagesByType(
          emailProvider,
          type,
          startOfDay,
          endOfDay,
        );

        count = messages.length;
      }

      return {
        date: dateString,
        Emails: count,
      };
    }),
  );

  return lastSevenDaysCountsArray;
}

export const GET = withEmailProvider("user/stats/day", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const provider = request.emailProvider.name;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const query = statsByDayQuery.parse({ type });

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger: request.logger,
  });

  const result = await getPastSevenDayStats({
    ...query,
    emailProvider,
  });

  return NextResponse.json(result);
});
