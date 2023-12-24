import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getNewsletterCounts } from "@inboxzero/tinybird";
import { withError } from "@/utils/middleware";
import {
  filterNewsletters,
  findAutoArchiveFilter,
  findNewsletterStatus,
  getAutoArchiveFilters,
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

  const newsletterCounts = await getNewsletterCounts({
    ...options,
    ...types,
  });

  const autoArchiveFilters = await getAutoArchiveFilters();
  const userNewsletters = await findNewsletterStatus(options.userId);

  const newsletters = newsletterCounts.data.map((email) => {
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
  });

  const result = await getNewslettersTinybird({
    ...params,
    ownerEmail: session.user.email,
    userId: session.user.id,
  });

  return NextResponse.json(result);
});
