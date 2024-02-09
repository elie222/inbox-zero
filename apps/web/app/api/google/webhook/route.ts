import { NextResponse } from "next/server";
import { type gmail_v1 } from "googleapis";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { parseMessage } from "@/utils/mail";
import { INBOX_LABEL_ID, SENT_LABEL_ID } from "@/utils/label";
import { planOrExecuteAct } from "@/app/api/ai/act/controller";
import { type RuleWithActions } from "@/utils/types";
import { withError } from "@/utils/middleware";
import { getMessage, hasPreviousEmailsFromSender } from "@/utils/gmail/message";
import { getThread } from "@/utils/gmail/thread";
import { parseEmail } from "@/utils/mail";
import { UserAIFields, getAiModel } from "@/utils/openai";
import { findUnsubscribeLink } from "@/utils/unsubscribe";
import { hasFeatureAccess, isPremium } from "@/utils/premium";
import { ColdEmailSetting } from "@prisma/client";
import { runColdEmailBlocker } from "@/app/api/ai/cold-email/controller";
import { captureException } from "@/utils/error";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export const POST = withError(async (request: Request) => {
  const body = await request.json();
  const decodedData = decodeHistoryId(body);
  const { historyId } = decodedData;

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
          coldEmailBlocker: true,
          coldEmailPrompt: true,
          aiModel: true,
          openAIApiKey: true,
          premium: {
            select: {
              lemonSqueezyRenewsAt: true,
              coldEmailBlockerAccess: true,
              aiAutomationAccess: true,
            },
          },
        },
      },
    },
  });

  if (!account) {
    console.error(
      "Google webhook: Account not found",
      decodedData.emailAddress,
    );
    return NextResponse.json({ ok: true });
  }

  const premium = isPremium(account.user.premium?.lemonSqueezyRenewsAt || null)
    ? account.user.premium
    : undefined;

  if (!premium) {
    console.log(
      "Google webhook: Account not premium",
      decodedData.emailAddress,
    );
    return NextResponse.json({ ok: true });
  }

  const { hasAiOrColdEmailAccess, hasColdEmailAccess, hasAiAccess } =
    hasFeatureAccess(premium, account.user.openAIApiKey);

  if (!hasAiOrColdEmailAccess) {
    console.debug(
      "Google webhook: does not have hasAiOrColdEmailAccess",
      decodedData.emailAddress,
    );
    return NextResponse.json({ ok: true });
  }

  const hasAutomationRules = account.user.rules.length > 0;
  const shouldBlockColdEmails =
    account.user.coldEmailBlocker &&
    account.user.coldEmailBlocker !== ColdEmailSetting.DISABLED;
  if (!hasAutomationRules && !shouldBlockColdEmails) {
    console.debug(
      "Google webhook: has no rules set and cold email blocker disabled",
      decodedData.emailAddress,
    );
    return NextResponse.json({ ok: true });
  }

  if (!account.access_token || !account.refresh_token) {
    console.error(
      "Missing access or refresh token. User needs to re-authenticate.",
      decodedData.emailAddress,
    );
    return NextResponse.json({ ok: true });
  }

  if (!account.user.email) {
    // shouldn't ever happen
    console.error("Missing user email.", decodedData.emailAddress);
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

    const startHistoryId = Math.max(
      parseInt(account.user.lastSyncedHistoryId || "0"),
      historyId - 500, // avoid going too far back
    ).toString();

    console.log(
      "Webhook: Listing history... Start:",
      startHistoryId,
      "lastSyncedHistoryId",
      account.user.lastSyncedHistoryId,
      "gmail historyId",
      historyId,
      decodedData.emailAddress,
    );

    const history = await gmail.users.history.list({
      userId: "me",
      // NOTE this can cause problems if we're way behind
      // NOTE this doesn't include startHistoryId in the results
      startHistoryId,
      labelId: INBOX_LABEL_ID,
      historyTypes: ["messageAdded"],
      maxResults: 10,
    });

    if (history.data.history) {
      console.log("Webhook: Processing...", decodedData.emailAddress);

      await processHistory({
        history: history.data.history,
        userId: account.userId,
        userEmail: account.user.email,
        email: decodedData.emailAddress,
        gmail,
        rules: account.user.rules,
        about: account.user.about || "",
        aiModel: getAiModel(account.user.aiModel),
        openAIApiKey: account.user.openAIApiKey,
        hasAutomationRules,
        coldEmailPrompt: account.user.coldEmailPrompt,
        coldEmailBlocker: account.user.coldEmailBlocker,
        hasColdEmailAccess: hasColdEmailAccess,
        hasAiAutomationAccess: hasAiAccess,
      });
    } else {
      console.log("Webhook: No history", decodedData);

      // important to save this or we can get into a loop with never receiving history
      await prisma.user.update({
        where: { email: account.user.email },
        data: { lastSyncedHistoryId: historyId.toString() },
      });
    }

    console.log("Webhook: Completed.", decodedData);

    return NextResponse.json({ ok: true });
  } catch (error) {
    captureException(error, { extra: { decodedData } });
    console.error("Error processing webhook", error, decodedData);
    return NextResponse.json({ error: true });
    // be careful about calling an error here with the wrong settings, as otherwise PubSub will call the webhook over and over
    // return NextResponse.error();
  }
});

function decodeHistoryId(body: any) {
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
  const historyId =
    typeof decodedData.historyId === "string"
      ? parseInt(decodedData.historyId)
      : decodedData.historyId;

  return { emailAddress: decodedData.emailAddress, historyId };
}

type ProcessHistoryOptions = {
  history: gmail_v1.Schema$History[];
  userId: string;
  userEmail: string;
  email: string;
  about: string;
  gmail: gmail_v1.Gmail;
  rules: RuleWithActions[];
  hasAutomationRules: boolean;
  coldEmailBlocker: ColdEmailSetting | null;
  coldEmailPrompt: string | null;
  hasColdEmailAccess: boolean;
  hasAiAutomationAccess: boolean;
} & UserAIFields;

async function processHistory(options: ProcessHistoryOptions) {
  const { history, email } = options;

  if (!history?.length) return;

  for (const h of history) {
    if (!h.messagesAdded?.length) continue;

    for (const m of h.messagesAdded) {
      try {
        await processHistoryItem(m, options);
      } catch (error) {
        captureException(error, { extra: { email, messageId: m.message?.id } });
        console.error("Error processing history item", options.email, error);
      }
    }
  }

  const lastSyncedHistoryId = history[history.length - 1].id;

  await prisma.user.update({
    where: { email },
    data: { lastSyncedHistoryId },
  });
}

async function processHistoryItem(
  m: gmail_v1.Schema$HistoryMessageAdded,
  options: ProcessHistoryOptions,
) {
  if (!m.message?.id) return;
  if (!m.message?.threadId) return;
  // skip emails the user sent
  if (m.message.labelIds?.includes(SENT_LABEL_ID)) {
    console.log(
      `Skipping email with SENT label`,
      options.userEmail,
      m.message.id,
    );
    return;
  }

  const { userId, userEmail, gmail, about } = options;

  console.log("Getting message...", options.userEmail, m.message.id);

  try {
    const gmailMessage = await getMessage(m.message.id, gmail, "full");

    const gmailThread = await getThread(m.message.threadId!, gmail);
    const isThread = gmailThread.messages && gmailThread.messages.length > 1;

    console.log("Fetched message", options.userEmail, m.message.id);

    const parsedMessage = parseMessage(gmailMessage);

    if (
      options.coldEmailBlocker &&
      options.coldEmailBlocker !== ColdEmailSetting.DISABLED &&
      options.hasColdEmailAccess &&
      // skip messages in threads
      !isThread
    ) {
      const unsubscribeLink =
        findUnsubscribeLink(parsedMessage.textHtml) ||
        parsedMessage.headers["list-unsubscribe"];

      const hasPreviousEmail = await hasPreviousEmailsFromSender(gmail, {
        from: parsedMessage.headers.from,
        date: parsedMessage.headers.date,
        threadId: m.message.threadId,
      });

      await runColdEmailBlocker({
        hasPreviousEmail,
        unsubscribeLink,
        email: {
          from: parsedMessage.headers.from,
          subject: parsedMessage.headers.subject,
          body: parsedMessage.snippet,
          messageId: m.message.id,
        },
        userOptions: options,
        gmail,
        coldEmailBlocker: options.coldEmailBlocker,
        userId,
        userEmail,
      });
    }

    if (options.hasAutomationRules && options.hasAiAutomationAccess) {
      console.log("Plan or act on message...", options.userEmail, m.message.id);

      if (
        !parsedMessage.textHtml &&
        !parsedMessage.textPlain &&
        !parsedMessage.snippet
      ) {
        console.log(
          "Skipping. No plain text found.",
          options.userEmail,
          m.message.id,
        );
        return;
      }

      const applicableRules = isThread
        ? options.rules.filter((r) => r.runOnThreads)
        : options.rules;

      if (applicableRules.length === 0) {
        console.log(
          `Skipping thread with ${gmailThread.messages?.length} messages`,
          options.userEmail,
          m.message.id,
        );
        return;
      }

      const content =
        (parsedMessage.textHtml &&
          parseEmail(parsedMessage.textHtml, false, null)) ||
        parsedMessage.textPlain ||
        parsedMessage.snippet;

      const res = await planOrExecuteAct({
        allowExecute: true,
        email: {
          from: parsedMessage.headers.from,
          replyTo: parsedMessage.headers["reply-to"],
          cc: parsedMessage.headers.cc,
          subject: parsedMessage.headers.subject,
          textHtml: parsedMessage.textHtml || null,
          textPlain: parsedMessage.textPlain || null,
          snippet: parsedMessage.snippet,
          content,
          threadId: m.message.threadId,
          messageId: m.message.id,
          headerMessageId: parsedMessage.headers["message-id"] || "",
          // unsubscribeLink,
          // hasPreviousEmail,
        },
        rules: applicableRules,
        gmail,
        userId,
        userEmail,
        aiModel: options.aiModel,
        openAIApiKey: options.openAIApiKey,
        automated: true,
        userAbout: about,
      });

      console.log("Result:", options.userEmail, m.message.id, res);
    }

    // if (shouldCategorise) {
    // console.log("Categorising thread...");

    // await categorise(
    //   {
    //     from: parsedMessage.headers.from,
    //     subject: parsedMessage.headers.subject,
    //     content,
    //     snippet: parsedMessage.snippet,
    //     threadId: m.message.threadId,
    //     aiModel: options.aiModel,
    //     openAIApiKey: options.openAIApiKey,
    //     unsubscribeLink,
    //     hasPreviousEmail,
    //   },
    //   {
    //     email,
    //   },
    // );
    // }
  } catch (error: any) {
    // gmail bug or snoozed email: https://stackoverflow.com/questions/65290987/gmail-api-getmessage-method-returns-404-for-message-gotten-from-listhistory-meth
    if (error.message === "Requested entity was not found.") {
      console.log("Message not found.", options.userEmail, m.message.id);
      return;
    }

    throw error;
  }
}
