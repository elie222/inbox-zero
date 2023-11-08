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
    .optional()
    .transform((arr) => arr?.filter(Boolean)),
});
export type NewsletterStatsQuery = z.infer<typeof newsletterStatsQuery>;
export type NewsletterStatsResponse = Awaited<
  ReturnType<typeof getNewslettersTinybird>
>;

async function getNewslettersTinybird(
  options: { ownerEmail: string } & NewsletterStatsQuery
) {
  const newsletterCounts = await getNewsletterCounts({
    ...options,
    all: !options.types?.length,
    read: !!options.types?.includes("read"),
    unread: !!options.types?.includes("unread"),
    archived: !!options.types?.includes("archived"),
    unarchived: !!options.types?.includes("unarchived"),
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
    types: searchParams.get("types")?.split(","),
  });

  const result = await getNewslettersTinybird({
    ...params,
    ownerEmail: session.user.email,
  });

  return NextResponse.json(result);
}
