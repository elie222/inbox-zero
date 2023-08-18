import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { gmail_v1 } from "googleapis";
import { parseMessage } from "@/utils/mail";
import countBy from "lodash/countBy";
import { getMessage } from "@/utils/gmail/message";

export type SendersResponse = Awaited<ReturnType<typeof getSenders>>;

async function getSenders(options: { gmail: gmail_v1.Gmail }) {
  const { gmail } = options;

  // 1. get last 500 messages
  const res = await gmail.users.messages.list({
    userId: "me",
    // q: `-in:sent after:${twentyFourHoursAgoInSeconds}`,
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

  // 2. get unique senders and counts
  const countBySender = countBy(messages, (m) => m.parsedMessage.headers.from);
  const countByDomain = countBy(messages, (m) =>
    parseDomain(m.parsedMessage.headers.from)
  );
  return { countBySender, countByDomain };

  // 3. store results in redis with history id
}

// Converts "Name <hey@domain.com>" to "domain.com"
function parseDomain(email: string) {
  const domain = email.match(/@([\w.-]+\.[a-zA-Z]{2,6})/)?.[1];
  return domain;
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);

  const result = await getSenders({ gmail });

  return NextResponse.json(result);
}
