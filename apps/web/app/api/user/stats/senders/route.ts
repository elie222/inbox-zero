import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getEmailFieldStats } from "@/app/api/user/stats/helpers";

const senderStatsQuery = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type SenderStatsQuery = z.infer<typeof senderStatsQuery>;

export interface SendersResponse {
  mostActiveSenderEmails: { name: string; value: number }[];
  mostActiveSenderDomains: { name: string; value: number }[];
}

/**
 * Get sender statistics from database
 */
async function getSenderStatistics(
  options: SenderStatsQuery & { userId: string },
): Promise<SendersResponse> {
  const [mostReceived, mostReceivedDomains] = await Promise.all([
    getMostReceivedFrom(options),
    getDomainsMostReceivedFrom(options),
  ]);

  return {
    mostActiveSenderEmails: mostReceived.data.map(
      (d: { from?: string; count: number }) => ({
        name: d.from || "",
        value: d.count,
      }),
    ),
    mostActiveSenderDomains: mostReceivedDomains.data.map(
      (d: { from?: string; count: number }) => ({
        name: d.from || "",
        value: d.count,
      }),
    ),
  };
}

/**
 * Get most received from senders by email address
 */
async function getMostReceivedFrom({
  userId,
  fromDate,
  toDate,
}: SenderStatsQuery & {
  userId: string;
}) {
  return getEmailFieldStats({
    userId,
    fromDate,
    toDate,
    field: "from",
    isSent: false,
  });
}

/**
 * Get most received from senders by domain
 */
async function getDomainsMostReceivedFrom({
  userId,
  fromDate,
  toDate,
}: SenderStatsQuery & {
  userId: string;
}) {
  return getEmailFieldStats({
    userId,
    fromDate,
    toDate,
    field: "fromDomain",
    isSent: false,
  });
}

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const query = senderStatsQuery.parse({
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getSenderStatistics({
    ...query,
    userId: session.user.id,
  });

  return NextResponse.json(result);
});
