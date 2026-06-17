import prisma from "@/utils/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { Logger } from "@/utils/logger";

export type SenderEmailStats = {
  from: string;
  fromName: string | null;
  minFromName: string | null;
  count: number;
  inboxEmails: number;
  readEmails: number;
  unsubscribeLink: string | null;
};

export type SenderEmailStatsOptions = {
  emailAccountId: string;
  /** Unix timestamp in milliseconds */
  fromDate?: number | null;
  /** Unix timestamp in milliseconds */
  toDate?: number | null;
  read?: boolean;
  unread?: boolean;
  archived?: boolean;
  unarchived?: boolean;
  search?: string;
  orderBy?: "emails" | "unread" | "unarchived";
  orderDirection?: "asc" | "desc";
  limit?: number | null;
  logger: Logger;
};

/**
 * Aggregates per-sender email stats from the EmailMessage table.
 * Powers the bulk unsubscribe page and the inbox health email.
 */
export async function getSenderEmailStats(
  options: SenderEmailStatsOptions,
): Promise<SenderEmailStats[]> {
  const { logger } = options;
  // Build WHERE conditions using Prisma.sql for type safety
  const whereConditions: Prisma.Sql[] = [];

  // Add date filters if provided
  if (options.fromDate) {
    const fromTimestamp = (options.fromDate / 1000).toString();
    whereConditions.push(
      Prisma.sql`"date" >= to_timestamp(${fromTimestamp}::double precision)`,
    );
  }

  if (options.toDate) {
    const toTimestamp = (options.toDate / 1000).toString();
    whereConditions.push(
      Prisma.sql`"date" <= to_timestamp(${toTimestamp}::double precision)`,
    );
  }

  // Add read/unread filters
  if (options.read) {
    whereConditions.push(Prisma.sql`read = true`);
  } else if (options.unread) {
    whereConditions.push(Prisma.sql`read = false`);
  }

  // Add inbox/archived filters
  if (options.unarchived) {
    whereConditions.push(Prisma.sql`inbox = true`);
  } else if (options.archived) {
    whereConditions.push(Prisma.sql`inbox = false`);
  }

  // Always filter by emailAccountId
  whereConditions.push(
    Prisma.sql`"emailAccountId" = ${options.emailAccountId}`,
  );

  // Add search filter if provided - search both from (email) and fromName fields
  if (options.search) {
    const searchTerm = options.search.toLowerCase();
    whereConditions.push(
      Prisma.sql`(position(${searchTerm} in LOWER("from")) > 0 OR position(${searchTerm} in LOWER(COALESCE("fromName", ''))) > 0)`,
    );
  }

  // Join conditions with AND
  const whereClause =
    whereConditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(whereConditions, " AND ")}`
      : Prisma.empty;

  // Build order by clause (safe, no user input)
  const orderByClause = options.orderBy
    ? getOrderByClause(options.orderBy, options.orderDirection)
    : '"count" DESC';

  // Build limit clause (safe, validated number)
  const limitClause = options.limit ? `LIMIT ${options.limit}` : "";

  // Build the complete query using Prisma.sql
  const query = Prisma.sql`
    WITH email_message_stats AS (
      SELECT 
        "from",
        MAX(NULLIF("fromName", '')) as "fromName",
        MIN(NULLIF("fromName", '')) as "minFromName",
        COUNT(*)::int as "count",
        SUM(CASE WHEN inbox = true THEN 1 ELSE 0 END)::int as "inboxEmails",
        SUM(CASE WHEN read = true THEN 1 ELSE 0 END)::int as "readEmails",
        MAX("unsubscribeLink") as "unsubscribeLink"
      FROM "EmailMessage"
      ${whereClause}
      GROUP BY "from"
    )
    SELECT * FROM email_message_stats
    ORDER BY ${Prisma.raw(orderByClause)}
    ${Prisma.raw(limitClause)}
  `;

  try {
    const results = await prisma.$queryRaw<SenderEmailStats[]>(query);

    // Convert BigInt values to regular numbers
    return results.map((result) => ({
      from: result.from,
      fromName: result.fromName,
      minFromName: result.minFromName,
      count: result.count,
      inboxEmails: result.inboxEmails,
      readEmails: result.readEmails,
      unsubscribeLink: result.unsubscribeLink,
    }));
  } catch (error) {
    logger.error("getSenderEmailStats error", {
      error,
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return [];
  }
}

function getOrderByClause(
  orderBy: string,
  orderDirection?: "asc" | "desc",
): string {
  const direction = orderDirection?.toUpperCase() || "DESC";

  switch (orderBy) {
    case "emails":
      return `"count" ${direction}`;
    case "unread":
      // Sort by read percentage (lower = more unread)
      return `"readEmails"::float / NULLIF("count", 0) ${direction}`;
    case "unarchived":
      // Sort by archived percentage (lower = more in inbox)
      return `("count" - "inboxEmails")::float / NULLIF("count", 0) ${direction}`;
    default:
      return `"count" ${direction}`;
  }
}
