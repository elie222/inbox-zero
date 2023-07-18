import { NextResponse } from "next/server";
import { gmail_v1, google } from "googleapis";
import { getClient } from "@/utils/google";
import prisma from "@/utils/prisma";
import { plan } from "@/app/api/ai/plan/route";
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
    const history = await listHistory(
      {
        email: decodedData.emailAddress,
        startHistoryId:
          account.user.lastSyncedHistoryId || decodedData.historyId,
      },
      account
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
  account: { access_token?: string | null; refresh_token?: string | null }
) {
  const { startHistoryId } = options;

  const auth = getClient({
    accessToken: account.access_token ?? undefined,
    refreshToken: account.refresh_token ?? undefined,
  });
  const gmail = google.gmail({ version: "v1", auth });

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

      const message =
        parsedMessage.textPlain ||
        parsedMessage.textHtml ||
        parsedMessage.headers.subject;

      if (message) {
        await plan({ message, id: m.message.id }, { id: userId, email });
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
