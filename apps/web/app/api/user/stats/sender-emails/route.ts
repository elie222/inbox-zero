import { NextResponse } from "next/server";
import { z } from "zod";
import format from "date-fns/format";
import { zodPeriod } from "@inboxzero/tinybird";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { Prisma } from "@prisma/client";

const senderEmailsQuery = z.object({
  fromEmail: z.string(),
  period: zodPeriod,
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type SenderEmailsQuery = z.infer<typeof senderEmailsQuery>;
export type SenderEmailsResponse = Awaited<ReturnType<typeof getSenderEmails>>;

async function getSenderEmails(
  options: SenderEmailsQuery & { emailAccountId: string },
) {
  const { fromEmail, period, fromDate, toDate, emailAccountId } = options;

  // Define the date truncation function based on the period
  let dateFunction: string;
  if (period === "day") {
    dateFunction = "DATE_TRUNC('day', date)";
  } else if (period === "week") {
    dateFunction = "DATE_TRUNC('week', date)";
  } else if (period === "month") {
    dateFunction = "DATE_TRUNC('month', date)";
  } else {
    dateFunction = "DATE_TRUNC('year', date)";
  }

  // Build the query with optional date filters
  let query = Prisma.sql`
    SELECT ${Prisma.raw(dateFunction)} AS "startOfPeriod", COUNT(*) as count
    FROM "EmailMessage"
    WHERE "emailAccountId" = ${emailAccountId}
      AND "from" = ${fromEmail}
  `;

  // Add date filters if provided
  if (fromDate) {
    query = Prisma.sql`${query} AND "date" >= ${new Date(fromDate)}`;
  }

  if (toDate) {
    query = Prisma.sql`${query} AND "date" <= ${new Date(toDate)}`;
  }

  // Complete the query with GROUP BY and ORDER BY
  query = Prisma.sql`
    ${query}
    GROUP BY "startOfPeriod"
    ORDER BY "startOfPeriod"
  `;

  const senderEmails =
    await prisma.$queryRaw<Array<{ startOfPeriod: Date; count: number }>>(
      query,
    );

  return {
    result: senderEmails.map((d: { startOfPeriod: Date; count: number }) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Emails: Number(d.count),
    })),
  };
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);

  const query = senderEmailsQuery.parse({
    fromEmail: searchParams.get("fromEmail"),
    period: searchParams.get("period") || "week",
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getSenderEmails({
    ...query,
    emailAccountId,
  });

  return NextResponse.json(result);
});
