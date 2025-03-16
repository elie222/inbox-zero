import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import {
  filterNewsletters,
  findAutoArchiveFilter,
  findNewsletterStatus,
  getAutoArchiveFilters,
} from "@/app/api/user/stats/newsletters/helpers";
import prisma from "@/utils/prisma";
import { Prisma } from "@prisma/client";

// not sure why this is slow sometimes
export const maxDuration = 30;

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
  ReturnType<typeof getNewslettersTinybird>
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

async function getNewslettersTinybird(
  options: { ownerEmail: string; userId: string } & NewsletterStatsQuery,
) {
  const types = getTypeFilters(options.types);

  const [newsletterCounts, autoArchiveFilters, userNewsletters] =
    await Promise.all([
      getNewsletterCounts({
        ...options,
        ...types,
      }),
      getAutoArchiveFilters(),
      findNewsletterStatus(options.userId),
    ]);

  const newsletters = newsletterCounts.map((email: NewsletterCountResult) => {
    return {
      name: email.from,
      value: email.count,
      inboxEmails: email.inboxEmails,
      readEmails: email.readEmails,
      lastUnsubscribeLink: email.lastUnsubscribeLink,
      autoArchived: findAutoArchiveFilter(autoArchiveFilters, email.from),
      status: userNewsletters?.find((n) => n.email === email.from)?.status,
    };
  });

  if (!options.filters?.length) return { newsletters };

  return {
    newsletters: filterNewsletters(newsletters, options.filters),
  };
}

type NewsletterCountResult = {
  from: string;
  count: number;
  inboxEmails: number;
  readEmails: number;
  lastUnsubscribeLink: string | null;
};

async function getNewsletterCounts(
  options: NewsletterStatsQuery & {
    userId: string;
    read?: boolean;
    unread?: boolean;
    archived?: boolean;
    unarchived?: boolean;
    all?: boolean;
    andClause?: boolean;
  },
): Promise<NewsletterCountResult[]> {
  const where = [];

  // Add date filters if provided
  if (options.fromDate) {
    where.push(`date >= '${new Date(options.fromDate).toISOString()}'`);
  }

  if (options.toDate) {
    where.push(`date <= '${new Date(options.toDate).toISOString()}'`);
  }

  // Add read/unread filters
  if (options.read) {
    where.push("read = true");
  } else if (options.unread) {
    where.push("read = false");
  }

  // Add inbox/archived filters
  if (options.unarchived) {
    where.push("inbox = true");
  } else if (options.archived) {
    where.push("inbox = false");
  }

  // Always filter by userId
  where.push(`"userId" = '${options.userId}'`);

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Wrap in a subquery so we can use aliases in ORDER BY
  const query = Prisma.sql`
    WITH newsletter_stats AS (
      SELECT 
        "from",
        COUNT(*) as "count",
        SUM(CASE WHEN inbox = true THEN 1 ELSE 0 END) as "inboxEmails",
        SUM(CASE WHEN read = true THEN 1 ELSE 0 END) as "readEmails",
        MAX("unsubscribeLink") as "lastUnsubscribeLink"
      FROM "EmailMessage"
      ${Prisma.raw(whereClause)}
      GROUP BY "from"
    )
    SELECT * FROM newsletter_stats
    ${Prisma.raw(options.orderBy ? `ORDER BY ${getOrderByClause(options.orderBy)}` : 'ORDER BY "count" DESC')}
    ${Prisma.raw(options.limit ? `LIMIT ${options.limit}` : "")}
  `;

  try {
    const results = await prisma.$queryRaw<any[]>(query);

    // Convert BigInt values to regular numbers
    return results.map((result) => ({
      from: result.from,
      count: Number(result.count),
      inboxEmails: Number(result.inboxEmails),
      readEmails: Number(result.readEmails),
      lastUnsubscribeLink: result.lastUnsubscribeLink,
    }));
  } catch (error) {
    console.error("Newsletter query error:", error);
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

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

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

  const result = await getNewslettersTinybird({
    ...params,
    ownerEmail: session.user.email,
    userId: session.user.id,
  });

  return NextResponse.json(result);
});
