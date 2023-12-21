import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getEmailsFromSender, zodPeriod } from "@inboxzero/tinybird";
import { format } from "date-fns";
import { withError } from "@/utils/middleware";

const senderEmailsQuery = z.object({
  fromEmail: z.string(),
  period: zodPeriod,
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type SenderEmailsQuery = z.infer<typeof senderEmailsQuery>;
export type SenderEmailsResponse = Awaited<ReturnType<typeof getSenderEmails>>;

async function getSenderEmails(
  options: SenderEmailsQuery & { ownerEmail: string },
) {
  const senderEmails = await getEmailsFromSender(options);

  return {
    result: senderEmails.data.map((d) => ({
      startOfPeriod: format(d.startOfPeriod, "LLL dd, y"),
      Emails: d.count,
    })),
  };
}

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);

  const query = senderEmailsQuery.parse({
    fromEmail: searchParams.get("fromEmail"),
    period: searchParams.get("period") || "week",
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getSenderEmails({
    ...query,
    ownerEmail: session.user.email,
  });

  return NextResponse.json(result);
});
