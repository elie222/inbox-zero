import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailFieldStats } from "@/app/api/user/stats/helpers";

const recipientStatsQuery = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type RecipientStatsQuery = z.infer<typeof recipientStatsQuery>;

export interface RecipientsResponse {
  mostActiveRecipientEmails: { name: string; value: number }[];
}

async function getRecipientStatistics(
  options: RecipientStatsQuery & { emailAccountId: string },
): Promise<RecipientsResponse> {
  const [mostReceived] = await Promise.all([getMostSentTo(options)]);

  return {
    mostActiveRecipientEmails: mostReceived.data.map(
      (d: { to?: string; count: number }) => ({
        name: d.to || "",
        value: d.count,
      }),
    ),
  };
}

/**
 * Get most sent to recipients by email address
 */
async function getMostSentTo({
  emailAccountId,
  fromDate,
  toDate,
}: RecipientStatsQuery & {
  emailAccountId: string;
}) {
  return getEmailFieldStats({
    emailAccountId,
    fromDate,
    toDate,
    field: "to",
    isSent: true,
  });
}

export const GET = withEmailAccount(
  "user/stats/recipients",
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;
    const { searchParams } = new URL(request.url);
    const query = recipientStatsQuery.parse({
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    const result = await getRecipientStatistics({
      ...query,
      emailAccountId,
    });

    return NextResponse.json(result);
  },
);
