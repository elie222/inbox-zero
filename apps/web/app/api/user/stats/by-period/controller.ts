import { format } from "date-fns/format";
import { z } from "zod";
import sumBy from "lodash/sumBy";
import { zodPeriod } from "@inboxzero/tinybird";
import prisma from "@/utils/prisma";
import { Prisma } from "@/generated/prisma/client";

export const statsByPeriodQuerySchema = z.object({
  period: zodPeriod,
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type StatsByPeriodQuery = z.infer<typeof statsByPeriodQuerySchema>;
export type StatsByPeriodResponse = Awaited<
  ReturnType<typeof getStatsByPeriod>
>;

async function getEmailStatsByPeriod(
  options: StatsByPeriodQuery & { emailAccountId: string },
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

  // Using raw query with properly typed parameters
  type StatsResult = {
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
    SELECT
      DATE_TRUNC(${Prisma.raw(`'${period}'`)}, date) AS "startOfPeriod",
      COUNT(*) AS "totalCount",
      SUM(CASE WHEN inbox = true THEN 1 ELSE 0 END) AS "inboxCount",
      SUM(CASE WHEN inbox = false THEN 1 ELSE 0 END) AS "notInbox",
      SUM(CASE WHEN read = true THEN 1 ELSE 0 END) AS "readCount",
      SUM(CASE WHEN read = false THEN 1 ELSE 0 END) AS unread,
      SUM(CASE WHEN sent = true THEN 1 ELSE 0 END) AS "sentCount"
    FROM "EmailMessage"
    ${whereClause}${dateClause}
    GROUP BY "startOfPeriod"
    ORDER BY "startOfPeriod"
  `;
}

export async function getStatsByPeriod(
  options: StatsByPeriodQuery & {
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
