import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { withError } from "@/utils/middleware";
import { publishEmail } from "@inboxzero/tinybird";
import { gmail_v1 } from "googleapis";
import { getGmailClient } from "@/utils/gmail/client";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";

export type PublishAllEmailsResponse = Awaited<
  ReturnType<typeof publishAllEmails>
>;

async function publishAllEmails(options: {
  ownerEmail: string;
  gmail: gmail_v1.Gmail;
}) {
  const { ownerEmail, gmail } = options;

  // 1. find all emails since the last time we ran this function
  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults: 500,
  });

  // 2. fetch each email and publish it to tinybird
  for (const m of res.data.messages || []) {
    if (!m.id || !m.threadId) continue;

    const message = await getMessage(m.id, gmail);
    const parsedEmail = parseMessage(message);

    await publishEmail({
      ownerEmail,
      threadId: m.threadId,
      gmailMessageId: m.id,
      from: parsedEmail.headers.from,
      to: parsedEmail.headers.to || "Missing",
      subject: parsedEmail.headers.subject,
      timestamp: +new Date(parsedEmail.headers.date),
      hasUnsubscribe: !!parsedEmail.textHtml?.includes("Unsubscribe"),
      read: !parsedEmail.labelIds?.includes("UNREAD"),
      sent: parsedEmail.labelIds?.includes("SENT"),
      draft: parsedEmail.labelIds?.includes("DRAFT"),
      inbox: parsedEmail.labelIds?.includes("INBOX"),
    });
  }

  return { emailsPublished: res.data.messages?.length };
}

export const GET = withError(async (request: Request) => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);

  const result = await publishAllEmails({
    ownerEmail: session.user.email,
    gmail,
  });

  return NextResponse.json(result);
});
