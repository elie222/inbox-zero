import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/utils/auth";
import { getLargestEmails } from "@inboxzero/tinybird";

export const largestEmailsQuery = z.object({
  limit: z.number().nullish(),
  fromDate: z.number().nullish(),
  toDate: z.number().nullish(),
});
export type LargestEmailsQuery = z.infer<typeof largestEmailsQuery>;
export type LargestEmailsResponse = Awaited<
  ReturnType<typeof getNewslettersTinybird>
>;

async function getNewslettersTinybird(
  options: { ownerEmail: string } & LargestEmailsQuery
) {
  const largestEmails = await getLargestEmails(options);

  return { largestEmails: largestEmails.data };
}

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const params = largestEmailsQuery.parse({
    limit: searchParams.get("limit"),
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getNewslettersTinybird({
    ownerEmail: session.user.email,
    ...params,
  });

  return NextResponse.json(result);
}
