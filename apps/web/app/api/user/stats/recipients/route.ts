import { NextResponse } from "next/server";
import { z } from "zod";
import countBy from "lodash/countBy";
import sortBy from "lodash/sortBy";
import { gmail_v1 } from "googleapis";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
// import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import {
  getDomainsMostSentTo,
  getMostSentTo,
  zodPeriod,
} from "@inboxzero/tinybird";
import { extractDomainFromEmail } from "@/utils/email";
import { withError } from "@/utils/middleware";

const recipientStatsQuery = z.object({
  period: zodPeriod,
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type RecipientStatsQuery = z.infer<typeof recipientStatsQuery>;
export type RecipientsResponse = Awaited<ReturnType<typeof getRecipients>>;

async function getRecipients(options: { gmail: gmail_v1.Gmail }) {
  const { gmail } = options;

  const res = await gmail.users.messages.list({
    userId: "me",
    q: `in:sent`,
    maxResults: 50,
  });

  // be careful of rate limiting here
  const messages = await Promise.all(
    res.data.messages?.map(async (m) => {
      const message = await getMessage(m.id!, gmail);
      const parsedMessage = parseMessage(message);

      return {
        ...message,
        parsedMessage,
      };
    }) || [],
  );

  const countByRecipient = countBy(messages, (m) => m.parsedMessage.headers.to);
  const countByDomain = countBy(messages, (m) =>
    extractDomainFromEmail(m.parsedMessage.headers.to),
  );

  const mostActiveRecipientEmails = sortBy(
    Object.entries(countByRecipient),
    ([, count]) => -count,
  ).map(([recipient, count]) => ({
    name: recipient,
    value: count,
  }));

  const mostActiveRecipientDomains = sortBy(
    Object.entries(countByDomain),
    ([, count]) => -count,
  ).map(([recipient, count]) => ({
    name: recipient,
    value: count,
  }));

  return { mostActiveRecipientEmails, mostActiveRecipientDomains };
}

async function getRecipientsTinybird(
  options: RecipientStatsQuery & {
    ownerEmail: string;
  },
): Promise<RecipientsResponse> {
  const [mostReceived, mostReceivedDomains] = await Promise.all([
    getMostSentTo(options),
    getDomainsMostSentTo(options),
  ]);

  return {
    mostActiveRecipientEmails: mostReceived.data.map((d) => ({
      name: d.to,
      value: d.count,
    })),
    mostActiveRecipientDomains: mostReceivedDomains.data.map((d) => ({
      name: d.to,
      value: d.count,
    })),
  };
}

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  // const gmail = getGmailClient(session);

  const { searchParams } = new URL(request.url);
  const query = recipientStatsQuery.parse({
    period: searchParams.get("period") || "week",
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  // const result = await getRecipients({ gmail });
  const result = await getRecipientsTinybird({
    ...query,
    ownerEmail: session.user.email,
  });

  return NextResponse.json(result);
});
