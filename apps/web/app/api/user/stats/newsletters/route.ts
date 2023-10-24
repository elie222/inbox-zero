import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/utils/auth";
import { getNewsletterCounts } from "@inboxzero/tinybird";

const newsletterStatsQuery = z.object({
  limit: z.number().nullish(),
  fromDate: z.number().nullish(),
  toDate: z.number().nullish(),
  orderBy: z.enum(["emails", "unread", "unarchived"]).optional(),
});
export type NewsletterStatsQuery = z.infer<typeof newsletterStatsQuery>;
export type NewsletterStatsResponse = Awaited<
  ReturnType<typeof getNewslettersTinybird>
>;

async function getNewslettersTinybird(
  options: { ownerEmail: string } & NewsletterStatsQuery
) {
  const newsletterCounts = await getNewsletterCounts(options);

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
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const params = newsletterStatsQuery.parse({
    limit: searchParams.get("limit"),
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
    orderBy: searchParams.get("orderBy"),
  });

  const result = await getNewslettersTinybird({
    ownerEmail: session.user.email,
    ...params,
  });

  return NextResponse.json(result);
}
