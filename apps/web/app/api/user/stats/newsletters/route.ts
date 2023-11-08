import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getNewsletterCounts } from "@inboxzero/tinybird";

const newsletterStatsQuery = z.object({
  limit: z.number().nullish(),
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
  orderBy: z.enum(["emails", "unread", "unarchived"]).optional(),
  types: z
    .array(z.enum(["read", "unread", "archived", "unarchived", ""]))
    .transform((arr) => arr?.filter(Boolean)),
});
export type NewsletterStatsQuery = z.infer<typeof newsletterStatsQuery>;
export type NewsletterStatsResponse = Awaited<
  ReturnType<typeof getNewslettersTinybird>
>;

async function getNewslettersTinybird(
  options: { ownerEmail: string } & NewsletterStatsQuery
) {
  const typeMap = Object.fromEntries(options.types.map((type) => [type, true]));

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
    !options.types.length ||
    options.types.length === 4 ||
    (!read && !unread && !archived && !unarchived);

  const newsletterCounts = await getNewsletterCounts({
    ...options,
    all,
    read,
    unread,
    archived,
    unarchived,
    andClause,
  });

  return {
    newsletterCounts: newsletterCounts.data.map((d) => ({
      name: d.from,
      value: d.count,
      inboxEmails: d.inboxEmails,
      readEmails: d.readEmails,
      lastUnsubscribeLink: d.lastUnsubscribeLink,
    })),
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
  });

  const result = await getNewslettersTinybird({
    ...params,
    ownerEmail: session.user.email,
  });

  return NextResponse.json(result);
}
