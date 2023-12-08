import { NextResponse } from "next/server";
import { gmail_v1 } from "googleapis";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
// import { plan } from "@/app/api/ai/plan/controller";
import { parseMessage } from "@/utils/mail";
import { INBOX_LABEL_ID, SENT_LABEL_ID } from "@/utils/label";
import { planOrExecuteAct } from "@/app/api/ai/act/controller";
import { type RuleWithActions } from "@/utils/types";
import { withError } from "@/utils/middleware";
import { getMessage, hasPreviousEmailsFromSender } from "@/utils/gmail/message";
import { getThread } from "@/utils/gmail/thread";
import { categorise } from "@/app/api/ai/categorise/controller";
import { parseEmail } from "@/utils/mail";
import { AIModel, UserAIFields } from "@/utils/openai";
import { findUnsubscribeLink, getHeaderUnsubscribe } from "@/utils/unsubscribe";

export const dynamic = "force-dynamic";

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export const POST = withError(async (request: Request) => {
  const body = await request.json();

  const data = body.message.data;

  // data is base64url-encoded JSON
  const decodedData: { emailAddress: string; historyId: number | string } =
    JSON.parse(
      Buffer.from(data, "base64")
        .toString()
        .replace(/-/g, "+")
        .replace(/_/g, "/"),
    );

  // seem to get this in different formats? so unifying as number
  const historyId: number =
    typeof decodedData.historyId === "string"
      ? parseInt(decodedData.historyId)
      : decodedData.historyId;

  console.log("Webhook. Processing:", decodedData);

  const account = await prisma.account.findFirst({
    where: { user: { email: decodedData.emailAddress }, provider: "google" },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
      providerAccountId: true,
      userId: true,
      user: {
        select: {
          email: true,
          about: true,
          lastSyncedHistoryId: true,
          rules: { include: { actions: true } },
          aiModel: true,
          openAIApiKey: true,
        },
      },
    },
  });
  if (!account) return NextResponse.json({ ok: true });
  if (!account.user.rules.length) return NextResponse.json({ ok: true });

  if (!account.access_token || !account.refresh_token) {
    console.error(
      "Missing access or refresh token. User needs to re-authenticate.",
    );
    return NextResponse.json({ ok: true });
  }

  if (!account.user.email) {
    // shouldn't ever happen
    console.error("Missing user email.");
    return NextResponse.json({ ok: true });
  }

  try {
    const gmail = await getGmailClientWithRefresh(
      {
        accessToken: account.access_token,
        refreshToken: account.refresh_token,
        expiryDate: account.expires_at,
      },
      account.providerAccountId,
    );

    console.log("Webhook: Listing history...");

    const startHistoryId = Math.max(
      parseInt(account.user.lastSyncedHistoryId || "0"),
      historyId - 100, // avoid going too far back
    ).toString();

    const history = await listHistory(
      {
        email: decodedData.emailAddress,
        // NOTE this can cause problems if we're way behind
        // NOTE this doesn't include startHistoryId in the results
        startHistoryId,
      },
      gmail,
    );

    if (history?.length) {
      console.log("Webhook: Planning...");

      await planHistory({
        history,
        userId: account.userId,
        userEmail: account.user.email,
        email: decodedData.emailAddress,
        gmail,
        rules: account.user.rules,
        about: account.user.about || "",
        aiModel: account.user.aiModel as AIModel,
        openAIApiKey: account.user.openAIApiKey,
      });
    } else {
      console.log("Webhook: No history");

      // important to save this or we can get into a loop with never receiving history
      await prisma.user.update({
        where: { email: account.user.email },
        data: { lastSyncedHistoryId: historyId.toString() },
      });
    }

    console.log("Webhook: Completed.", decodedData);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: true });
    // be careful about calling an error here with the wrong settings, as otherwise PubSub will call the webhook over and over
    // return NextResponse.error();
  }
});

async function listHistory(
  options: { email: string; startHistoryId: string },
  gmail: gmail_v1.Gmail,
): Promise<gmail_v1.Schema$History[] | undefined> {
  const { startHistoryId } = options;

  const history = await gmail.users.history.list({
    userId: "me",
    startHistoryId,
    labelId: INBOX_LABEL_ID,
    historyTypes: ["messageAdded"],
    maxResults: 10,
  });

  return history.data.history;
}

async function planHistory(
  options: {
    history: gmail_v1.Schema$History[];
    userId: string;
    userEmail: string;
    email: string;
    about: string;
    gmail: gmail_v1.Gmail;
    rules: RuleWithActions[];
  } & UserAIFields,
) {
  const { history, userId, userEmail, email, gmail, rules, about } = options;

  if (!history?.length) return;

  for (const h of history) {
    if (!h.messagesAdded?.length) continue;

    for (const m of h.messagesAdded) {
      if (!m.message?.id) continue;
      if (!m.message?.threadId) continue;
      // skip emails the user sent
      if (m.message.labelIds?.includes(SENT_LABEL_ID)) {
        console.log(`Skipping email with SENT label`);
        continue;
      }

      console.log("Getting message...", m.message.id);

      try {
        const gmailMessage = await getMessage(m.message.id, gmail, "full");

        // skip messages in threads
        const gmailThread = await getThread(m.message.threadId!, gmail);
        if ((gmailThread.messages?.length || 0) > 1) {
          console.log(
            `Skipping thread with ${gmailThread.messages?.length} messages`,
          );
          continue;
        }

        console.log("Received message...");

        const parsedMessage = parseMessage(gmailMessage);

        if (
          !parsedMessage.textHtml &&
          !parsedMessage.textPlain &&
          !parsedMessage.snippet
        ) {
          console.log("Skipping. No plain text found.");
          return;
        }

        console.log("Categorising thread...");

        const content =
          (parsedMessage.textHtml &&
            parseEmail(parsedMessage.textHtml, false, null)) ||
          parsedMessage.textPlain ||
          parsedMessage.snippet;

        const unsubscribeLink =
          findUnsubscribeLink(parsedMessage.textHtml) ||
          getHeaderUnsubscribe(parsedMessage.headers);

        const hasPreviousEmail = await hasPreviousEmailsFromSender(gmail, {
          from: parsedMessage.headers.from,
          date: parsedMessage.headers.date,
          threadId: m.message.threadId,
        });

        await categorise(
          {
            from: parsedMessage.headers.from,
            subject: parsedMessage.headers.subject,
            content,
            snippet: parsedMessage.snippet,
            threadId: m.message.threadId,
            aiModel: options.aiModel,
            openAIApiKey: options.openAIApiKey,
            unsubscribeLink,
            hasPreviousEmail,
          },
          {
            email,
          },
        );

        console.log("Plan or act on message...");

        const res = await planOrExecuteAct({
          allowExecute: true,
          email: {
            from: parsedMessage.headers.from,
            replyTo: parsedMessage.headers.replyTo,
            cc: parsedMessage.headers.cc,
            subject: parsedMessage.headers.subject,
            textHtml: parsedMessage.textHtml || null,
            textPlain: parsedMessage.textPlain || null,
            snippet: parsedMessage.snippet,
            content,
            threadId: m.message.threadId,
            messageId: m.message.id,
            headerMessageId: parsedMessage.headers.messageId || "",
          },
          rules,
          gmail,
          userId,
          userEmail,
          aiModel: options.aiModel,
          openAIApiKey: options.openAIApiKey,
          automated: true,
          userAbout: about,
        });

        console.log("Result:", res);
      } catch (error: any) {
        // gmail bug or snoozed email: https://stackoverflow.com/questions/65290987/gmail-api-getmessage-method-returns-404-for-message-gotten-from-listhistory-meth
        if (error.message === "Requested entity was not found.") {
          console.log("Message not found.");
          continue;
        }

        throw error;
      }
    }
  }

  const lastSyncedHistoryId = history[history.length - 1].id;

  await prisma.user.update({
    where: { email },
    data: { lastSyncedHistoryId },
  });
}
