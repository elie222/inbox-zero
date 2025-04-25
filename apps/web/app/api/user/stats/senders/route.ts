import { z } from "zod";
import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
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
  options: SenderStatsQuery & { emailAccountId: string },
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
  emailAccountId,
  fromDate,
  toDate,
}: SenderStatsQuery & {
  emailAccountId: string;
}) {
  return getEmailFieldStats({
    emailAccountId,
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
  emailAccountId,
  fromDate,
  toDate,
}: SenderStatsQuery & {
  emailAccountId: string;
}) {
  return getEmailFieldStats({
    emailAccountId,
    fromDate,
    toDate,
    field: "fromDomain",
    isSent: false,
  });
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);
  const query = senderStatsQuery.parse({
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getSenderStatistics({
    ...query,
    emailAccountId,
  });

  return NextResponse.json(result);
});
