import { NextResponse } from "next/server";
import { gmail_v1 } from "googleapis";
import { getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
// import { plan } from "@/app/api/ai/plan/controller";
import { parseMessage } from "@/utils/mail";
import { INBOX_LABEL_ID } from "@/utils/label";
import { planOrExecuteAct } from "@/app/api/ai/act/controller";
import { RuleWithActions } from "@/utils/types";
import { withError } from "@/utils/middleware";

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export const POST = withError(async (request: Request) => {
  const body = await request.json();

  const data = body.message.data;

  // data is base64url-encoded JSON
  const decodedData: { emailAddress: string; historyId: string } = JSON.parse(
    Buffer.from(data, "base64").toString().replace(/-/g, "+").replace(/_/g, "/")
  );

  const account = await prisma.account.findFirst({
    where: { user: { email: decodedData.emailAddress }, provider: "google" },
    select: {
      access_token: true,
      refresh_token: true,
      userId: true,
      user: {
        select: {
          about: true,
          lastSyncedHistoryId: true,
          rules: { include: { actions: true } },
        },
      },
    },
  });
  if (!account) return;

  try {
    const gmail = getGmailClient({
      accessToken: account.access_token ?? undefined,
    });

    const history = await listHistory(
      {
        email: decodedData.emailAddress,
        startHistoryId:
          account.user.lastSyncedHistoryId || decodedData.historyId,
      },
      gmail
    );
    await planHistory({
      history: history || [],
      userId: account.userId,
      email: decodedData.emailAddress,
      gmail,
      rules: account.user.rules,
      about: account.user.about || "",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: true });
  }
});

async function listHistory(
  options: { email: string; startHistoryId: string },
  gmail: gmail_v1.Gmail
) {
  const { startHistoryId } = options;

  const history = await gmail.users.history.list({
    userId: "me",
    startHistoryId,
    labelId: INBOX_LABEL_ID,
    historyTypes: ["messageAdded"],
  });

  return history.data.history;
}

async function planHistory(options: {
  history: gmail_v1.Schema$History[];
  userId: string;
  email: string;
  about: string;
  gmail: gmail_v1.Gmail;
  rules: RuleWithActions[];
}) {
  const { history, userId, email, gmail, rules, about } = options;

  if (!history?.length) return;

  for (const h of history) {
    if (!h.messagesAdded?.length) continue;

    for (const m of h.messagesAdded) {
      if (!m.message?.id) continue;

      const parsedMessage = parseMessage(m.message);

      const message =
        parsedMessage.textPlain ||
        parsedMessage.textHtml ||
        parsedMessage.headers.subject;

      if (message) {
        // await plan(
        //   { subject: parsedMessage.headers.subject, message, id: m.message.id, senderEmail: parsedMessage.headers.from, replan: false },
        //   { id: userId, email }
        // );

        await planOrExecuteAct({
          allowExecute: true,
          email: {
            from: parsedMessage.headers.from,
            replyTo: parsedMessage.headers.replyTo,
            cc: parsedMessage.headers.cc,
            subject: parsedMessage.headers.subject,
            content: message,
            threadId: m.message.threadId || "",
            messageId: m.message.id,
            headerMessageId: parsedMessage.headers.messageId || "",
          },
          rules,
          gmail,
          userId,
          automated: true,
          userAbout: about,
        });
      } else {
        console.error("No message", parsedMessage);
      }
    }
  }

  const lastSyncedHistoryId = history[history.length - 1].id;

  await prisma.user.update({
    where: { email },
    data: { lastSyncedHistoryId },
  });
}
