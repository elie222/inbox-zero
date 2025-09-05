import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import {
  statsByPeriodQuerySchema,
  type StatsByPeriodResponse,
} from "../validation";
import { validateApiKeyAndGetGmailClient } from "@/utils/api-auth";
import { getEmailAccountId } from "@/app/api/v1/helpers";
import prisma from "@/utils/prisma";
import { Prisma } from "@prisma/client";
import format from "date-fns/format";

const logger = createScopedLogger("api/v1/stats/by-period");

export const GET = withError(async (request) => {
  const { userId, accountId } = await validateApiKeyAndGetGmailClient(request);

  const { searchParams } = new URL(request.url);
  const queryResult = statsByPeriodQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const emailAccountId = await getEmailAccountId({
    accountId,
    userId,
  });

  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 400 },
    );
  }

  try {
    const { fromDate, toDate, period } = queryResult.data;

    // Build date conditions
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

    // Query for periodic stats
    type StatsResult = {
      period_group: string;
      totalCount: bigint;
      inboxCount: bigint;
      readCount: bigint;
      sentCount: bigint;
      unread: bigint;
    };

    const baseQuery = Prisma.sql`
      SELECT 
        to_char(date, ${dateFormat}) as period_group,
        SUM("totalCount") as "totalCount",
        SUM("inboxCount") as "inboxCount",
        SUM("readCount") as "readCount",
        SUM("sentCount") as "sentCount",
        SUM("totalCount" - "readCount") as unread
      FROM "EmailStat"
      WHERE "emailAccountId" = ${emailAccountId}
      ${dateConditions.length > 0 ? Prisma.sql`AND ${Prisma.join(dateConditions, " AND ")}` : Prisma.empty}
      GROUP BY period_group
      ORDER BY period_group DESC
    `;

    const stats = await prisma.$queryRaw<StatsResult[]>(baseQuery);

    // Calculate summary
    const summary = {
      received: stats.reduce((sum, stat) => sum + Number(stat.totalCount), 0),
      read: stats.reduce((sum, stat) => sum + Number(stat.readCount), 0),
      archived: stats.reduce((sum, stat) => sum + Number(stat.totalCount) - Number(stat.inboxCount), 0),
      sent: stats.reduce((sum, stat) => sum + Number(stat.sentCount), 0),
    };

    const response: StatsByPeriodResponse = {
      stats: stats.map((stat) => ({
        date: stat.period_group,
        received: Number(stat.totalCount),
        read: Number(stat.readCount),
        archived: Number(stat.totalCount) - Number(stat.inboxCount),
        sent: Number(stat.sentCount),
        unread: Number(stat.unread),
      })),
      summary,
    };

    logger.info("Retrieved stats by period", {
      userId,
      emailAccountId,
      period,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error retrieving stats by period", {
      userId,
      error,
    });
    return NextResponse.json(
      { error: "Failed to retrieve stats" },
      { status: 500 },
    );
  }
});