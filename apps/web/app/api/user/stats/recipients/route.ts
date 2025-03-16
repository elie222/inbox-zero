import { NextResponse } from "next/server";
import { z } from "zod";
import countBy from "lodash/countBy";
import sortBy from "lodash/sortBy";
import type { gmail_v1 } from "@googleapis/gmail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { parseMessage } from "@/utils/mail";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { extractDomainFromEmail } from "@/utils/email";
import { withError } from "@/utils/middleware";
import { getEmailFieldStats } from "@/app/api/user/stats/helpers";

const recipientStatsQuery = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type RecipientStatsQuery = z.infer<typeof recipientStatsQuery>;

export interface RecipientsResponse {
  mostActiveRecipientEmails: { name: string; value: number }[];
}

async function getRecipients({
  gmail,
}: {
  gmail: gmail_v1.Gmail;
}): Promise<RecipientsResponse> {
  const res = await getMessages(gmail, {
    query: "in:sent",
    maxResults: 50,
  });

  // be careful of rate limiting here
  const messages = await Promise.all(
    res.messages?.map(async (m) => {
      const message = await getMessage(m.id!, gmail);
      return parseMessage(message);
    }) || [],
  );

  const countByRecipient = countBy(messages, (m) => m.headers.to);

  const mostActiveRecipientEmails = sortBy(
    Object.entries(countByRecipient),
    ([, count]) => -count,
  ).map(([recipient, count]) => ({
    name: recipient,
    value: count,
  }));

  return { mostActiveRecipientEmails };
}

async function getRecipientStatistics(
  options: RecipientStatsQuery & { userId: string },
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
  userId,
  fromDate,
  toDate,
}: RecipientStatsQuery & {
  userId: string;
}) {
  return getEmailFieldStats({
    userId,
    fromDate,
    toDate,
    field: "to",
    isSent: true,
  });
}

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const query = recipientStatsQuery.parse({
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getRecipientStatistics({
    ...query,
    userId: session.user.id,
  });

  return NextResponse.json(result);
});
