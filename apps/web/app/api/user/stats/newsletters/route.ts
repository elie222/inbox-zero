import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canonicalizeEmailAddress,
  getNewsletterSenderDisplayName,
} from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { withEmailProvider } from "@/utils/middleware";
import {
  getSenderEmailStats,
  senderStatsOrderBySchema,
} from "@/utils/sender-stats";
import {
  filterNewsletters,
  findAutoArchiveFilters,
  findNewsletterStatus,
  findSenderLabelFilters,
  getEmailFilters,
  getNewsletterStatuses,
} from "@/utils/senders/filters";

const newsletterStatsQuery = z.object({
  limit: z.coerce.number().int().positive().nullish(),
  cursor: z.string().trim().min(1).max(2048).optional(),
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
  orderBy: senderStatsOrderBySchema.optional(),
  orderDirection: z.enum(["asc", "desc"]).optional(),
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
  search: z.string().optional(),
});

export type NewsletterStatsQuery = z.infer<typeof newsletterStatsQuery>;
export type NewsletterStatsResponse = Awaited<
  ReturnType<typeof getEmailMessages>
>;

async function getEmailMessages(
  options: {
    emailAccountId: string;
    emailProvider: EmailProvider;
    logger: Logger;
  } & NewsletterStatsQuery,
) {
  const { emailAccountId, emailProvider, logger } = options;
  const types = getTypeFilters(options.types);

  const [senderStats, emailFilters, newsletterStatuses] = await Promise.all([
    getSenderEmailStats({
      emailAccountId,
      fromDate: options.fromDate,
      toDate: options.toDate,
      read: types.read,
      unread: types.unread,
      archived: types.archived,
      unarchived: types.unarchived,
      search: options.search,
      orderBy: options.orderBy,
      orderDirection: options.orderDirection,
      limit: options.limit,
      cursor: options.cursor,
    }),
    getEmailFilters(emailProvider, logger),
    getNewsletterStatuses({ emailAccountId }),
  ]);

  const newsletters = senderStats.senders.map((email) => {
    const from = canonicalizeEmailAddress(email.from);
    return {
      name: from,
      fromName: getNewsletterSenderDisplayName({
        email: from,
        fromName: email.fromName,
        minFromName: email.minFromName,
        maxFromName: email.fromName,
      }),
      value: email.count,
      inboxEmails: email.inboxEmails,
      readEmails: email.readEmails,
      lastEmailAt: email.lastEmailAt,
      unsubscribeLink: email.unsubscribeLink,
      autoArchived: findAutoArchiveFilters(
        emailFilters,
        from,
        emailProvider,
      )[0],
      labelFilters: findSenderLabelFilters(emailFilters, from),
      status: findNewsletterStatus(newsletterStatuses, from),
    };
  });
  const searchedSenderStatus = options.search
    ? findNewsletterStatus(newsletterStatuses, options.search)
    : undefined;

  // Cursor pages the aggregated sender list. Status filters run after that,
  // so a filtered page can be shorter than `limit` while `nextCursor` continues
  // from the last aggregated sender.
  return {
    newsletters: options.filters?.length
      ? filterNewsletters(newsletters, options.filters)
      : newsletters,
    nextCursor: senderStats.nextCursor,
    searchedSenderStatus,
  };
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
      orderBy: searchParams.get("orderBy") || undefined,
      orderDirection: searchParams.get("orderDirection") || undefined,
      cursor: searchParams.get("cursor") || undefined,
      types: searchParams.get("types")?.split(",") || [],
      filters: searchParams.get("filters")?.split(",") || [],
      includeMissingUnsubscribe:
        searchParams.get("includeMissingUnsubscribe") === "true",
      search: searchParams.get("search") || undefined,
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
