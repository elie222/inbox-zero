import { NextResponse } from "next/server";
import countBy from "lodash/countBy";
import { gmail_v1 } from "googleapis";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import { parseDomain } from "@/app/api/user/stats/senders/route";

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
    }) || []
  );

  const countByRecipient = countBy(messages, (m) => m.parsedMessage.headers.to);
  const countByDomain = countBy(messages, (m) =>
    parseDomain(m.parsedMessage.headers.to)
  );
  return { countByRecipient, countByDomain };

  // TODO store results in redis with history id?
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);

  const result = await getRecipients({ gmail });

  return NextResponse.json(result);
}
