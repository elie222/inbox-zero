import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import {
  filterNewsletters,
  findAutoArchiveFilter,
  findNewsletterStatus,
  getAutoArchiveFilters,
} from "@/app/api/user/stats/newsletters/helpers";
import prisma from "@/utils/prisma";
import { Prisma } from "@prisma/client";
import { extractEmailAddress } from "@/utils/email";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("newsletter-stats");

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
  options: { emailAccountId: string } & NewsletterStatsQuery,
) {
  const { emailAccountId } = options;
  const types = getTypeFilters(options.types);

  // Get the email account to determine the provider
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: { provider: true },
      },
    },
  });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
  });

  const [counts, autoArchiveFilters, userNewsletters] = await Promise.all([
    getNewsletterCounts({
      ...options,
      ...types,
    }),
    getAutoArchiveFilters(emailProvider),
    findNewsletterStatus({ emailAccountId }),
  ]);

  const newsletters = counts.map((email) => {
    const from = extractEmailAddress(email.from);
    return {
      name: from,
      value: email.count,
      inboxEmails: email.inboxEmails,
      readEmails: email.readEmails,
      unsubscribeLink: email.unsubscribeLink,
      autoArchived: findAutoArchiveFilter(autoArchiveFilters, from),
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
  count: number;
  inboxEmails: number;
  readEmails: number;
  unsubscribeLink: string | null;
};

type NewsletterCountRawResult = {
  from: string;
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
  },
): Promise<NewsletterCountResult[]> {
  logger.info("Getting newsletter counts", {
    emailAccountId: options.emailAccountId,
    fromDate: options.fromDate,
    toDate: options.toDate,
    read: options.read,
    unread: options.unread,
    archived: options.archived,
    unarchived: options.unarchived,
    limit: options.limit,
    orderBy: options.orderBy,
  });

  // Collect SQL query conditions
  const whereConditions: string[] = [];
  const queryParams: Array<string | Date> = [];

  // Add date filters if provided
  if (options.fromDate) {
    whereConditions.push(
      `"date" >= to_timestamp($${queryParams.length + 1}::double precision)`,
    );
    queryParams.push((options.fromDate / 1000).toString()); // Convert milliseconds to seconds
  }

  if (options.toDate) {
    whereConditions.push(
      `"date" <= to_timestamp($${queryParams.length + 1}::double precision)`,
    );
    queryParams.push((options.toDate / 1000).toString()); // Convert milliseconds to seconds
  }

  // Add read/unread filters
  if (options.read) {
    whereConditions.push("read = true");
  } else if (options.unread) {
    whereConditions.push("read = false");
  }

  // Add inbox/archived filters
  if (options.unarchived) {
    whereConditions.push("inbox = true");
  } else if (options.archived) {
    whereConditions.push("inbox = false");
  }

  // Always exclude drafts
  whereConditions.push("draft = false");
  whereConditions.push("sent = false");

  // Always filter by userId
  whereConditions.push(`"emailAccountId" = $${queryParams.length + 1}`);
  queryParams.push(options.emailAccountId);

  // Create WHERE clause
  const whereClause = whereConditions.length
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  // Build order by clause
  const orderByClause = options.orderBy
    ? getOrderByClause(options.orderBy)
    : '"count" DESC';

  // Build limit clause
  const limitClause = options.limit ? `LIMIT ${options.limit}` : "";

  // Wrap in a subquery so we can use aliases in ORDER BY
  const query = Prisma.sql`
    WITH email_message_stats AS (
      SELECT 
        "from",
        COUNT(*)::int as "count",
        SUM(CASE WHEN inbox = true THEN 1 ELSE 0 END)::int as "inboxEmails",
        SUM(CASE WHEN read = true THEN 1 ELSE 0 END)::int as "readEmails",
        MAX("unsubscribeLink") as "unsubscribeLink"
      FROM "EmailMessage"
      ${Prisma.raw(whereClause)}
      GROUP BY "from"
    )
    SELECT * FROM email_message_stats
    ORDER BY ${Prisma.raw(orderByClause)}
    ${Prisma.raw(limitClause)}
  `;

  logger.info("Executing newsletter counts query", {
    whereClause,
    orderByClause,
    limitClause,
    queryParams,
    querySql: query.sql,
  });

  try {
    const results = await prisma.$queryRawUnsafe<NewsletterCountRawResult[]>(
      query.sql,
      ...queryParams,
      ...query.values,
    );

    logger.info("Newsletter counts query results", {
      resultsLength: results.length,
      sampleResults: results.slice(0, 3),
    });

    // Convert BigInt values to regular numbers
    return results.map((result) => ({
      from: result.from,
      count: result.count,
      inboxEmails: result.inboxEmails,
      readEmails: result.readEmails,
      unsubscribeLink: result.unsubscribeLink,
    }));
  } catch (error) {
    logger.error("getNewsletterCounts error", {
      error,
      errorMessage: (error as any)?.message,
      errorStack: (error as any)?.stack,
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

// Helper function to extract unsubscribe links from email content
function extractUnsubscribeLink(content: string): string | null {
  // Simple regex to find unsubscribe links
  const unsubscribeRegex =
    /(?:unsubscribe|opt.?out|remove).*?(?:https?:\/\/[^\s<>"']+)/gi;
  const match = unsubscribeRegex.exec(content);
  return match ? match[0] : null;
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

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
  });

  return NextResponse.json(result);
});
