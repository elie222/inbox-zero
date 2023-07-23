import { NextResponse } from "next/server";
import { gmail_v1 } from "googleapis";
import { getGmailClient } from "@/utils/google";
import prisma from "@/utils/prisma";
import { plan } from "@/app/api/ai/plan/controller";
import { parseMessage } from "@/utils/mail";
import { INBOX_LABEL_ID } from "@/utils/label";

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export async function POST(request: Request) {
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
      user: { select: { lastSyncedHistoryId: true } },
    },
  });
  if (!account) return;

  try {
    const gmail = getGmailClient({
      accessToken: account.access_token ?? undefined,
      refreshToken: account.refresh_token ?? undefined,
    });

    const history = await listHistory(
      {
        email: decodedData.emailAddress,
        startHistoryId:
          account.user.lastSyncedHistoryId || decodedData.historyId,
      },
      gmail
    );
    await planHistory(history || [], account.userId, decodedData.emailAddress);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: true });
  }
}

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

async function planHistory(
  history: gmail_v1.Schema$History[],
  userId: string,
  email: string
) {
  if (!history?.length) return;

  for (const h of history) {
    if (!h.messagesAdded?.length) continue;

    for (const m of h.messagesAdded) {
      if (!m.message?.id) continue;

      const parsedMessage = parseMessage(m.message);

      const subject = parsedMessage.headers.subject;
      const message =
        parsedMessage.textPlain ||
        parsedMessage.textHtml ||
        parsedMessage.headers.subject;

      if (message) {
        await plan(
          { subject, message, id: m.message.id, replan: false },
          { id: userId, email }
        );
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
