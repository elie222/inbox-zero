import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getNewsletterCounts } from "@inboxzero/tinybird";
import { getGmailClient } from "@/utils/gmail/client";
import { getFiltersList } from "@/utils/gmail/filter";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";
import { Newsletter } from "@prisma/client";

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

async function getAutoArchiveFilters() {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");
  const gmail = getGmailClient(session);

  const filters = await getFiltersList({ gmail });
  const autoArchiveFilters = filters.data.filter?.filter((filter) => {
    return (
      filter.action?.removeLabelIds?.includes("INBOX") ||
      filter.action?.addLabelIds?.includes("TRASH")
    );
  });

  return autoArchiveFilters;
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

  const showAutoArchived = options.filters?.includes("autoArchived");
  const showApproved = options.filters?.includes("approved");
  const showUnsubscribed = options.filters?.includes("unsubscribed");
  const showUnhandled = options.filters?.includes("unhandled");

  const userNewsletters = await prisma.newsletter.findMany({
    where: { userId: options.userId },
    select: { email: true, status: true },
  });

  const newsletters = newsletterCounts.data.map((email) => {
    const autoArchived = autoArchiveFilters?.find((filter) => {
      const from = extractEmailAddress(email.from);
      return filter.criteria?.from?.includes(from);
    });

    return {
      name: email.from,
      value: email.count,
      inboxEmails: email.inboxEmails,
      readEmails: email.readEmails,
      lastUnsubscribeLink: email.lastUnsubscribeLink,
      autoArchived,
      status: userNewsletters?.find((n) => n.email === email.from)?.status,
    };
  });

  if (!options.filters?.length) return { newsletters };

  return {
    newsletters: newsletters.filter((email) => {
      if (
        showAutoArchived &&
        (email.autoArchived || email.status === "AUTO_ARCHIVED")
      )
        return true;
      if (showUnsubscribed && email.status === "UNSUBSCRIBED") return true;
      if (showApproved && email.status === "APPROVED") return true;
      if (showUnhandled && !email.status && !email.autoArchived) return true;

      return false;
    }),
  };
}

export async function GET(request: Request) {
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
}
