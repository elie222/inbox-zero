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

  logger.info("Getting email messages", {
    emailAccountId,
    provider: emailAccount.account.provider,
    types,
    options,
  });

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

  logger.info("Retrieved data", {
    emailAccountId,
    countsLength: counts.length,
    autoArchiveFiltersLength: autoArchiveFilters.length,
    userNewslettersLength: userNewsletters.length,
    sampleCounts: counts.slice(0, 3),
  });

  // If no data in database and it's an Outlook account, try to get data directly from the provider
  if (
    counts.length === 0 &&
    emailAccount.account.provider === "microsoft-entra-id"
  ) {
    logger.info(
      "No EmailMessage data found for Outlook account, fetching directly from provider",
    );

    try {
      const directCounts = await getNewsletterCountsFromProvider(
        emailProvider,
        options,
      );
      logger.info("Retrieved direct counts from Outlook provider", {
        directCountsLength: directCounts.length,
        sampleDirectCounts: directCounts.slice(0, 3),
      });

      const newsletters = directCounts.map((email: NewsletterCountResult) => {
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

      logger.info("Processed direct newsletters", {
        emailAccountId,
        newslettersLength: newsletters.length,
        sampleNewsletters: newsletters.slice(0, 3),
      });

      if (!options.filters?.length) return { newsletters };

      return {
        newsletters: filterNewsletters(newsletters, options.filters),
      };
    } catch (error) {
      logger.error(
        "Error getting direct newsletter counts from Outlook provider",
        { error },
      );
      // Fall back to empty result
    }
  }

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

  logger.info("Processed newsletters", {
    emailAccountId,
    newslettersLength: newsletters.length,
    sampleNewsletters: newsletters.slice(0, 3),
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

async function getNewsletterCountsFromProvider(
  emailProvider: EmailProvider,
  options: NewsletterStatsQuery,
): Promise<NewsletterCountResult[]> {
  try {
    logger.info("Getting newsletter counts from provider", { options });

    // Get messages from the provider
    const messages = await emailProvider.getMessages(undefined, 1000); // Get up to 1000 messages

    logger.info("Retrieved messages from provider", {
      messageCount: messages.length,
      sampleMessages: messages.slice(0, 3).map((m) => ({
        id: m.id,
        from: m.headers.from,
        to: m.headers.to,
        labelIds: m.labelIds,
        subject: m.headers.subject,
      })),
    });

    // Group messages by sender
    const senderCounts = new Map<
      string,
      {
        count: number;
        inboxEmails: number;
        readEmails: number;
        unsubscribeLinks: Set<string>;
      }
    >();

    messages.forEach((message) => {
      const from = extractEmailAddress(message.headers.from);
      const to = extractEmailAddress(message.headers.to);

      // Skip sent messages (where from matches the user's email)
      if (from === to) {
        logger.info("Skipping sent message", {
          from,
          to,
          messageId: message.id,
        });
        return;
      }

      if (!senderCounts.has(from)) {
        senderCounts.set(from, {
          count: 0,
          inboxEmails: 0,
          readEmails: 0,
          unsubscribeLinks: new Set(),
        });
      }

      const sender = senderCounts.get(from)!;
      sender.count++;

      // Check if message is in inbox
      if (message.labelIds?.some((label) => label.toLowerCase() === "inbox")) {
        sender.inboxEmails++;
      }

      // Check if message is read (not unread)
      if (
        !message.labelIds?.some((label) => label.toLowerCase() === "unread")
      ) {
        sender.readEmails++;
      }

      // Extract unsubscribe link from message content
      const unsubscribeLink = extractUnsubscribeLink(
        message.textHtml || message.textPlain || "",
      );
      if (unsubscribeLink) {
        sender.unsubscribeLinks.add(unsubscribeLink);
      }
    });

    logger.info("Processed messages by sender", {
      totalMessages: messages.length,
      uniqueSenders: senderCounts.size,
      sampleSenders: Array.from(senderCounts.entries())
        .slice(0, 3)
        .map(([from, data]) => ({
          from,
          count: data.count,
          inboxEmails: data.inboxEmails,
          readEmails: data.readEmails,
        })),
    });

    // Convert to the expected format
    const results: NewsletterCountResult[] = Array.from(
      senderCounts.entries(),
    ).map(([from, data]) => ({
      from,
      count: data.count,
      inboxEmails: data.inboxEmails,
      readEmails: data.readEmails,
      unsubscribeLink: Array.from(data.unsubscribeLinks)[0] || null,
    }));

    // Sort by count descending
    results.sort((a, b) => b.count - a.count);

    // Apply limit if specified
    if (options.limit) {
      results.splice(options.limit);
    }

    logger.info("Processed newsletter counts from provider", {
      resultsLength: results.length,
      sampleResults: results.slice(0, 3),
    });

    return results;
  } catch (error) {
    logger.error("Error getting newsletter counts from provider", { error });
    return [];
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
