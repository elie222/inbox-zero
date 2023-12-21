import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getLargestEmails } from "@inboxzero/tinybird";
import { withError } from "@/utils/middleware";

const largestEmailsQuery = z.object({
  limit: z.coerce.number().nullish(),
  fromDate: z.number().nullish(),
  toDate: z.number().nullish(),
});
export type LargestEmailsQuery = z.infer<typeof largestEmailsQuery>;
export type LargestEmailsResponse = Awaited<
  ReturnType<typeof getNewslettersTinybird>
>;

async function getNewslettersTinybird(
  options: { ownerEmail: string } & LargestEmailsQuery,
) {
  const largestEmails = await getLargestEmails(options);

  return { largestEmails: largestEmails.data };
}

export const GET = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

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
});
