import { z } from "zod";
import { NextResponse } from "next/server";
import { gmail_v1 } from "googleapis";
import countBy from "lodash/countBy";
import sortBy from "lodash/sortBy";
import { getAuthSession } from "@/utils/auth";
// import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import {
  getDomainsMostReceivedFrom,
  getMostReceivedFrom,
  zodPeriod,
} from "@inboxzero/tinybird";

const senderStatsQuery = z.object({
  period: zodPeriod,
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type SenderStatsQuery = z.infer<typeof senderStatsQuery>;
export type SendersResponse = Awaited<ReturnType<typeof getSenders>>;

async function getSenders(options: { gmail: gmail_v1.Gmail }) {
  const { gmail } = options;

  const res = await gmail.users.messages.list({
    userId: "me",
    q: `-in:sent`,
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
    }) || []
  );

  const countBySender = countBy(messages, (m) => m.parsedMessage.headers.from);
  const countByDomain = countBy(messages, (m) =>
    parseDomain(m.parsedMessage.headers.from)
  );

  const mostActiveSenderEmails = sortBy(
    Object.entries(countBySender),
    ([, count]) => -count
  ).map(([sender, count]) => ({
    name: sender,
    value: count,
  }));

  const mostActiveSenderDomains = sortBy(
    Object.entries(countByDomain),
    ([, count]) => -count
  ).map(([sender, count]) => ({
    name: sender,
    value: count,
  }));

  return { mostActiveSenderEmails, mostActiveSenderDomains };
}

// Converts "Name <hey@domain.com>" to "domain.com"
export function parseDomain(email: string) {
  const domain = email.match(/@([\w.-]+\.[a-zA-Z]{2,6})/)?.[1];
  return domain;
}

async function getSendersTinybird(
  options: SenderStatsQuery & {
    ownerEmail: string;
  }
): Promise<SendersResponse> {
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

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  // const gmail = getGmailClient(session);

  const { searchParams } = new URL(request.url);
  const query = senderStatsQuery.parse({
    period: searchParams.get("period") || "week",
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });
  console.log("🚀 ~ file: route.ts:110 ~ GET ~ query:", query);

  // const result = await getSenders({ gmail });
  const result = await getSendersTinybird({
    ownerEmail: session.user.email,
    ...query,
  });

  return NextResponse.json(result);
}
