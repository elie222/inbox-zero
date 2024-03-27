import uniqBy from "lodash/uniqBy";
import { NextResponse } from "next/server";
import { type gmail_v1 } from "googleapis";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { parseMessage } from "@/utils/mail";
import { DRAFT_LABEL_ID, INBOX_LABEL_ID, SENT_LABEL_ID } from "@/utils/label";
import { planOrExecuteAct } from "@/app/api/ai/act/controller";
import { type RuleWithActions } from "@/utils/types";
import { withError } from "@/utils/middleware";
import { getMessage, hasPreviousEmailsFromSender } from "@/utils/gmail/message";
import { getThread } from "@/utils/gmail/thread";
import { UserAIFields } from "@/utils/llms/types";
import { hasFeatureAccess, isPremium } from "@/utils/premium";
import { ColdEmailSetting } from "@prisma/client";
import { runColdEmailBlocker } from "@/app/api/ai/cold-email/controller";
import { captureException } from "@/utils/error";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { getAiProviderAndModel } from "@/utils/llms";
import { env } from "@/env.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Google PubSub calls this endpoint each time a user recieves an email. We subscribe for updates via `api/google/watch`
export const POST = withError(async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;
  if (
    env.GOOGLE_PUBSUB_VERIFICATION_TOKEN &&
    searchParams.get("token") !== env.GOOGLE_PUBSUB_VERIFICATION_TOKEN
  ) {
    console.error("Invalid verification token");
    return NextResponse.json(
      {
        message: "Invalid verification token",
      },
      { status: 403 },
    );
  }

  const body = await request.json();
  const decodedData = decodeHistoryId(body);

  console.log("Webhook. Processing:", decodedData);

  return await processHistoryForUser(decodedData);
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

export async function processHistoryForUser(
  decodedData: {
    emailAddress: string;
    historyId: number;
  },
  options?: { startHistoryId?: string },
) {
  const { emailAddress: email, historyId } = decodedData;

  const account = await prisma.account.findFirst({
    where: { user: { email }, provider: "google" },
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
          aiProvider: true,
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
    console.error("Google webhook: Account not found", email);
    return NextResponse.json({ ok: true });
  }

  const premium = isPremium(account.user.premium?.lemonSqueezyRenewsAt || null)
    ? account.user.premium
    : undefined;

  if (!premium) {
    console.log("Google webhook: Account not premium", email);
    return NextResponse.json({ ok: true });
  }

  const { hasAiOrColdEmailAccess, hasColdEmailAccess, hasAiAccess } =
    hasFeatureAccess(premium, account.user.openAIApiKey);

  if (!hasAiOrColdEmailAccess) {
    console.debug(
      "Google webhook: does not have hasAiOrColdEmailAccess",
      email,
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
      email,
    );
    return NextResponse.json({ ok: true });
  }

  if (!account.access_token || !account.refresh_token) {
    console.error(
      "Missing access or refresh token. User needs to re-authenticate.",
      email,
    );
    return NextResponse.json({ ok: true });
  }

  if (!account.user.email) {
    // shouldn't ever happen
    console.error("Missing user email.", email);
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

    const startHistoryId =
      options?.startHistoryId ||
      Math.max(
        parseInt(account.user.lastSyncedHistoryId || "0"),
        historyId - 500, // avoid going too far back
      ).toString();

    console.log(
      "Webhook: Listing history... Start:",
      startHistoryId,
      "lastSyncedHistoryId",
      account.user.lastSyncedHistoryId,
      "gmailHistoryId",
      startHistoryId,
      email,
    );

    const history = await gmail.users.history.list({
      userId: "me",
      // NOTE this can cause problems if we're way behind
      // NOTE this doesn't include startHistoryId in the results
      startHistoryId,
      labelId: INBOX_LABEL_ID,
      historyTypes: ["messageAdded", "labelAdded"],
      maxResults: 500,
    });

    if (history.data.history) {
      console.log(
        "Webhook: Processing...",
        email,
        startHistoryId,
        history.data.historyId,
      );

      const { model, provider } = getAiProviderAndModel(
        account.user.aiProvider,
        account.user.aiModel,
      );

      await processHistory({
        history: history.data.history,
        userId: account.userId,
        userEmail: account.user.email,
        email,
        gmail,
        rules: account.user.rules,
        about: account.user.about || "",
        aiProvider: provider,
        aiModel: model,
        openAIApiKey: account.user.openAIApiKey,
        hasAutomationRules,
        coldEmailPrompt: account.user.coldEmailPrompt,
        coldEmailBlocker: account.user.coldEmailBlocker,
        hasColdEmailAccess: hasColdEmailAccess,
        hasAiAutomationAccess: hasAiAccess,
      });
    } else {
      console.log(
        "Webhook: No history",
        decodedData,
        "startHistoryId:",
        startHistoryId,
      );

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
    const historyMessages = [
      ...(h.messagesAdded || []),
      ...(h.labelsAdded || []),
    ];

    if (!historyMessages.length) continue;

    const inboxMessages = historyMessages.filter(
      (m) =>
        m.message?.labelIds?.includes(INBOX_LABEL_ID) &&
        !m.message?.labelIds?.includes(DRAFT_LABEL_ID) &&
        !m.message?.labelIds?.includes(SENT_LABEL_ID),
    );
    const uniqueMessages = uniqBy(inboxMessages, (m) => m.message?.id);

    for (const m of uniqueMessages) {
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
  m: gmail_v1.Schema$HistoryMessageAdded | gmail_v1.Schema$HistoryLabelAdded,
  options: ProcessHistoryOptions,
) {
  const message = m.message;
  const messageId = message?.id;
  const threadId = message?.threadId;
  const {
    userId,
    userEmail,
    gmail,
    about,
    coldEmailBlocker,
    hasColdEmailAccess,
    hasAutomationRules,
    hasAiAutomationAccess,
    rules,
  } = options;

  if (!messageId) return;
  if (!threadId) return;

  console.log("Getting message...", userEmail, messageId, threadId);

  try {
    const [gmailMessage, gmailThread, hasExistingRule] = await Promise.all([
      getMessage(messageId, gmail, "full"),
      getThread(threadId, gmail),
      prisma.executedRule.findUnique({
        where: { unique_user_thread_message: { userId, threadId, messageId } },
        select: { id: true },
      }),
    ]);

    if (hasExistingRule) {
      console.log(
        "Skipping. Rule already exists.",
        userEmail,
        messageId,
        threadId,
      );
      return;
    }

    const isThread = gmailThread.messages && gmailThread.messages.length > 1;

    console.log("Fetched message", userEmail, messageId, threadId);

    const parsedMessage = parseMessage(gmailMessage);

    if (
      coldEmailBlocker &&
      coldEmailBlocker !== ColdEmailSetting.DISABLED &&
      hasColdEmailAccess &&
      // skip messages in threads
      !isThread
    ) {
      const unsubscribeLink =
        findUnsubscribeLink(parsedMessage.textHtml) ||
        parsedMessage.headers["list-unsubscribe"];

      const hasPreviousEmail = await hasPreviousEmailsFromSender(gmail, {
        from: parsedMessage.headers.from,
        date: parsedMessage.headers.date,
        threadId,
      });

      await runColdEmailBlocker({
        hasPreviousEmail,
        unsubscribeLink,
        email: {
          from: parsedMessage.headers.from,
          subject: parsedMessage.headers.subject,
          body: parsedMessage.snippet,
          messageId,
        },
        userOptions: options,
        gmail,
        coldEmailBlocker: coldEmailBlocker,
        userId,
        userEmail,
      });
    }

    if (hasAutomationRules && hasAiAutomationAccess) {
      console.log("Plan or act on message...", userEmail, messageId, threadId);

      if (
        !parsedMessage.textHtml &&
        !parsedMessage.textPlain &&
        !parsedMessage.snippet
      ) {
        console.log(
          "Skipping. No plain text found.",
          userEmail,
          messageId,
          threadId,
        );
        return;
      }

      const applicableRules = isThread
        ? rules.filter((r) => r.runOnThreads)
        : rules;

      if (applicableRules.length === 0) {
        console.log(
          `Skipping thread with ${gmailThread.messages?.length} messages`,
          userEmail,
          messageId,
          threadId,
        );
        return;
      }

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
          threadId,
          messageId,
          headerMessageId: parsedMessage.headers["message-id"] || "",
          // unsubscribeLink,
          // hasPreviousEmail,
        },
        rules: applicableRules,
        gmail,
        userId,
        userEmail,
        aiProvider: options.aiProvider,
        aiModel: options.aiModel,
        openAIApiKey: options.openAIApiKey,
        automated: true,
        userAbout: about,
      });

      console.log("Result:", userEmail, messageId, threadId, res);
    }

    // if (shouldCategorise) {
    // console.log("Categorising thread...");

    // await categorise(
    //   {
    //     from: parsedMessage.headers.from,
    //     subject: parsedMessage.headers.subject,
    //     content,
    //     snippet: parsedMessage.snippet,
    //     threadId: threadId,
    //     aiModel: aiModel,
    //     openAIApiKey: openAIApiKey,
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
      console.log("Message not found.", userEmail, messageId, threadId);
      return;
    }

    throw error;
  }
}
