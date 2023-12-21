import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  getDomainsMostReceivedFrom,
  getMostReceivedFrom,
  zodPeriod,
} from "@inboxzero/tinybird";
import { withError } from "@/utils/middleware";

const senderStatsQuery = z.object({
  period: zodPeriod,
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type SenderStatsQuery = z.infer<typeof senderStatsQuery>;
export type SendersResponse = Awaited<ReturnType<typeof getSendersTinybird>>;

async function getSendersTinybird(
  options: SenderStatsQuery & {
    ownerEmail: string;
  },
) {
  const [mostSent, mostSentDomains] = await Promise.all([
    getMostReceivedFrom(options),
    getDomainsMostReceivedFrom(options),
  ]);

  return {
    mostActiveSenderEmails: mostSent.data.map((d) => ({
      name: d.from,
      value: d.count,
    })),
    mostActiveSenderDomains: mostSentDomains.data.map((d) => ({
      name: d.from,
      value: d.count,
    })),
  };
}

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const query = senderStatsQuery.parse({
    period: searchParams.get("period") || "week",
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getSendersTinybird({
    ...query,
    ownerEmail: session.user.email,
  });

  return NextResponse.json(result);
});
