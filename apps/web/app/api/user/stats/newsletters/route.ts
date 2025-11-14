import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import { extractEmailAddress } from "@/utils/email";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { Prisma } from "@prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import {
  getAutoArchiveFilters,
  findNewsletterStatus,
  findAutoArchiveFilter,
  filterNewsletters,
} from "@/app/api/user/stats/newsletters/helpers";

const newsletterStatsQuery = z.object({
  limit: z.coerce.number().nullish(),
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
  orderBy: z.enum(["emails", "unread", "unarchived"]).optional(),
  types: z
    .array(z.enum(["read", "unread", "archived", "unarchived", ""]))
    .transform((arr) => arr?.filter(Boolean)),
  filters: z
    .array(
      z.enum(["unhandled", "autoArchived", "unsubscribed", "approved", ""]),
    )
    .optional()
    .transform((arr) => arr?.filter(Boolean)),
  includeMissingUnsubscribe: z.boolean().optional(),
});

export type NewsletterStatsQuery = z.infer<typeof newsletterStatsQuery>;
export type NewsletterStatsResponse = Awaited<
  ReturnType<typeof getEmailMessages>
>;

function getTypeFilters(types: NewsletterStatsQuery["types"]) {
  const typeMap = Object.fromEntries(types.map((type) => [type, true]));

  // only use the read flag if unread is unmarked
  // if read and unread are both set or both unset, we don't need to filter by read/unread at all
  const read = Boolean(typeMap.read && !typeMap.unread);
  const unread = Boolean(!typeMap.read && typeMap.unread);

  // similar logic to read/unread
  const archived = Boolean(typeMap.archived && !typeMap.unarchived);
  const unarchived = Boolean(!typeMap.archived && typeMap.unarchived);

  // we only need AND if both read/unread and archived/unarchived are set
  const andClause = (read || unread) && (archived || unarchived);

  const all =
    !types.length ||
    types.length === 4 ||
    (!read && !unread && !archived && !unarchived);

  return {
    all,
    read,
    unread,
    archived,
    unarchived,
    andClause,
  };
}

async function getEmailMessages(
  options: {
    emailAccountId: string;
    emailProvider: EmailProvider;
    logger: Logger;
  } & NewsletterStatsQuery,
) {
  const { emailAccountId, emailProvider, logger } = options;
  const types = getTypeFilters(options.types);

  const [counts, autoArchiveFilters, userNewsletters] = await Promise.all([
    getNewsletterCounts({
      ...options,
      ...types,
      logger,
    }),
    getAutoArchiveFilters(emailProvider),
    findNewsletterStatus({ emailAccountId }),
  ]);

  const newsletters = counts.map((email) => {
    const from = extractEmailAddress(email.from);
    return {
      name: from,
      fromName: email.fromName || "",
      value: email.count,
      inboxEmails: email.inboxEmails,
      readEmails: email.readEmails,
      unsubscribeLink: email.unsubscribeLink,
      autoArchived: findAutoArchiveFilter(
        autoArchiveFilters,
        from,
        emailProvider,
      ),
      status: userNewsletters?.find((n) => n.email === from)?.status,
    };
  });

  if (!options.filters?.length) return { newsletters };

  return {
    newsletters: filterNewsletters(newsletters, options.filters),
  };
}

type NewsletterCountResult = {
  from: string;
  fromName: string | null;
  count: number;
  inboxEmails: number;
  readEmails: number;
  unsubscribeLink: string | null;
};

type NewsletterCountRawResult = {
  from: string;
  fromName: string | null;
  count: number;
  inboxEmails: number;
  readEmails: number;
  unsubscribeLink: string | null;
};

async function getNewsletterCounts(
  options: NewsletterStatsQuery & {
    emailAccountId: string;
    read?: boolean;
    unread?: boolean;
    archived?: boolean;
    unarchived?: boolean;
    all?: boolean;
    andClause?: boolean;
    logger: Logger;
  },
): Promise<NewsletterCountResult[]> {
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

  // Join conditions with AND
  const whereClause =
    whereConditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(whereConditions, " AND ")}`
      : Prisma.empty;

  // Build order by clause (safe, no user input)
  const orderByClause = options.orderBy
    ? getOrderByClause(options.orderBy)
    : '"count" DESC';

  // Build limit clause (safe, validated number)
  const limitClause = options.limit ? `LIMIT ${options.limit}` : "";

  // Build the complete query using Prisma.sql
  const query = Prisma.sql`
    WITH email_message_stats AS (
      SELECT 
        "from",
        MAX("fromName") as "fromName",
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
    const results = await prisma.$queryRaw<NewsletterCountRawResult[]>(query);

    // Convert BigInt values to regular numbers
    return results.map((result) => ({
      from: result.from,
      fromName: result.fromName,
      count: result.count,
      inboxEmails: result.inboxEmails,
      readEmails: result.readEmails,
      unsubscribeLink: result.unsubscribeLink,
    }));
  } catch (error) {
    logger.error("getNewsletterCounts error", {
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return [];
  }
}

function getOrderByClause(orderBy: string): string {
  switch (orderBy) {
    case "emails":
      return '"count" DESC';
    case "unread":
      return '"count" - "readEmails" DESC';
    case "unarchived":
      return '"inboxEmails" DESC';
    default:
      return '"count" DESC';
  }
}

export const GET = withEmailProvider(
  "user/stats/newsletters",
  async (request) => {
    const { emailProvider } = request;
    const { emailAccountId } = request.auth;

    const { searchParams } = new URL(request.url);
    const params = newsletterStatsQuery.parse({
      limit: searchParams.get("limit"),
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
      orderBy: searchParams.get("orderBy"),
      types: searchParams.get("types")?.split(",") || [],
      filters: searchParams.get("filters")?.split(",") || [],
      includeMissingUnsubscribe:
        searchParams.get("includeMissingUnsubscribe") === "true",
    });

    const result = await getEmailMessages({
      ...params,
      emailAccountId,
      emailProvider,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);
