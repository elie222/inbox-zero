import { NextResponse } from "next/server";
import format from "date-fns/format";
import { z } from "zod";
import sumBy from "lodash/sumBy";
import { zodPeriod } from "@inboxzero/tinybird";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { Prisma } from "@prisma/client";

const statsByWeekParams = z.object({
  period: zodPeriod,
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type StatsByWeekParams = z.infer<typeof statsByWeekParams>;
export type StatsByWeekResponse = Awaited<ReturnType<typeof getStatsByPeriod>>;

async function getEmailStatsByPeriod(
  options: StatsByWeekParams & { emailAccountId: string },
) {
  const { period, fromDate, toDate, emailAccountId } = options;

  // Build date conditions without starting with AND
  const dateConditions: Prisma.Sql[] = [];
  if (fromDate) {
    dateConditions.push(Prisma.sql`date >= ${new Date(fromDate)}`);
  }
  if (toDate) {
    dateConditions.push(Prisma.sql`date <= ${new Date(toDate)}`);
  }

  const dateFormat =
    period === "day"
      ? "YYYY-MM-DD"
      : period === "week"
        ? "YYYY-WW"
        : period === "month"
          ? "YYYY-MM"
          : "YYYY";

  // Using raw query with properly typed parameters
  type StatsResult = {
    period_group: string;
    startOfPeriod: Date;
    totalCount: bigint;
    inboxCount: bigint;
    readCount: bigint;
    sentCount: bigint;
    unread: bigint;
    notInbox: bigint;
  };

  // Create WHERE clause properly
  const whereClause = Prisma.sql`WHERE "emailAccountId" = ${emailAccountId}`;
  const dateClause =
    dateConditions.length > 0
      ? Prisma.sql` AND ${Prisma.join(dateConditions, " AND ")}`
      : Prisma.sql``;

  // Convert period and dateFormat to string literals in PostgreSQL
  return prisma.$queryRaw<StatsResult[]>`
    WITH stats AS (
      SELECT
        TO_CHAR(date, ${Prisma.raw(`'${dateFormat}'`)}) AS period_group,
        DATE_TRUNC(${Prisma.raw(`'${period}'`)}, date) AS start_of_period,
        COUNT(*) AS total_count,
        SUM(CASE WHEN inbox = true THEN 1 ELSE 0 END) AS inbox_count,
        SUM(CASE WHEN inbox = false THEN 1 ELSE 0 END) AS not_inbox,
        SUM(CASE WHEN read = true THEN 1 ELSE 0 END) AS read_count,
        SUM(CASE WHEN read = false THEN 1 ELSE 0 END) AS unread,
        SUM(CASE WHEN sent = true THEN 1 ELSE 0 END) AS sent_count
      FROM "EmailMessage"
      ${whereClause}${dateClause}
      GROUP BY period_group, start_of_period
      ORDER BY start_of_period
    )
    SELECT 
      period_group,
      start_of_period AS "startOfPeriod",
      total_count AS "totalCount",
      inbox_count AS "inboxCount",
      not_inbox AS "notInbox",
      read_count AS "readCount",
      unread,
      sent_count AS "sentCount"
    FROM stats
  `;
}

async function getStatsByPeriod(
  options: StatsByWeekParams & {
    emailAccountId: string;
  },
) {
  // Get all stats in a single query
  const stats = await getEmailStatsByPeriod(options);

  // Transform stats to match the expected format
  const formattedStats = stats.map((stat) => {
    const startOfPeriodFormatted = format(stat.startOfPeriod, "LLL dd, y");

    return {
      startOfPeriod: startOfPeriodFormatted,
      All: Number(stat.totalCount),
      Sent: Number(stat.sentCount),
      Read: Number(stat.readCount),
      Unread: Number(stat.unread),
      Unarchived: Number(stat.inboxCount),
      Archived: Number(stat.notInbox),
    };
  });

  // Calculate totals
  const totalAll = sumBy(stats, (stat) => Number(stat.totalCount));
  const totalInbox = sumBy(stats, (stat) => Number(stat.inboxCount));
  const totalRead = sumBy(stats, (stat) => Number(stat.readCount));
  const totalSent = sumBy(stats, (stat) => Number(stat.sentCount));

  return {
    result: formattedStats,
    allCount: totalAll,
    inboxCount: totalInbox,
    readCount: totalRead,
    sentCount: totalSent,
  };
}

export const GET = withEmailAccount(
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;

    const { searchParams } = new URL(request.url);
    const params = statsByWeekParams.parse({
      period: searchParams.get("period") || "week",
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    const result = await getStatsByPeriod({
      ...params,
      emailAccountId,
    });

    return NextResponse.json(result);
  },
  { allowOrgAdmins: true },
);
