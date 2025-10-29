import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { publishToQstash } from "@/utils/upstash";
import { getThreadMessages } from "@/utils/gmail/thread";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { getOutlookClientWithRefresh } from "@/utils/outlook/client";
import type { CleanGmailBody } from "@/app/api/clean/gmail/route";
import type { CleanOutlookBody } from "@/app/api/clean/outlook/route";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { aiClean } from "@/utils/ai/clean/ai-clean";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import {
  getEmailAccountWithAiAndTokens,
  getUserPremium,
} from "@/utils/user/get";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { getCalendarEventStatus } from "@/utils/parse/calender-event";
import { GmailLabel } from "@/utils/gmail/label";
import { isNewsletterSender } from "@/utils/ai/group/find-newsletters";
import { isMaybeReceipt, isReceipt } from "@/utils/ai/group/find-receipts";
import { saveThread, updateThread } from "@/utils/redis/clean";
import { internalDateToDate } from "@/utils/date";
import { CleanAction } from "@prisma/client";
import type { ParsedMessage } from "@/utils/types";
import { isActivePremium } from "@/utils/premium";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getMessage as getOutlookMessage } from "@/utils/outlook/message";

const logger = createScopedLogger("api/clean");

const cleanThreadBody = z.object({
  emailAccountId: z.string(),
  threadId: z.string(),
  markedDoneLabelId: z.string(),
  processedLabelId: z.string(),
  jobId: z.string(),
  action: z.enum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  instructions: z.string().optional(),
  skips: z.object({
    reply: z.boolean().default(true).nullish(),
    starred: z.boolean().default(true).nullish(),
    calendar: z.boolean().default(true).nullish(),
    receipt: z.boolean().default(false).nullish(),
    attachment: z.boolean().default(false).nullish(),
    conversation: z.boolean().default(false).nullish(),
  }),
  // labels: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});
export type CleanThreadBody = z.infer<typeof cleanThreadBody>;

async function cleanThread({
  emailAccountId,
  threadId,
  markedDoneLabelId,
  processedLabelId,
  jobId,
  action,
  instructions,
  skips,
}: CleanThreadBody) {
  // 1. get thread with messages
  // 2. process thread with ai / fixed logic
  // 3. add to gmail action queue

  const emailAccount = await getEmailAccountWithAiAndTokens({
    emailAccountId,
  });

  if (!emailAccount) throw new SafeError("User not found", 404);

  if (!emailAccount.tokens) throw new SafeError("No account tokens found", 404);
  if (!emailAccount.tokens.access_token || !emailAccount.tokens.refresh_token)
    throw new SafeError("No account tokens found", 404);

  // Premium check disabled for development/testing
  // TODO: Re-enable for production
  // const premium = await getUserPremium({ userId: emailAccount.userId });
  // if (!premium) throw new SafeError("User not premium");
  // if (!isActivePremium(premium)) throw new SafeError("Premium not active");

  let messages: ParsedMessage[];

  const isGmail = isGoogleProvider(emailAccount.account.provider);

  if (isGmail) {
    // Gmail: Use existing Gmail client
    const gmail = await getGmailClientWithRefresh({
      accessToken: emailAccount.tokens.access_token,
      refreshToken: emailAccount.tokens.refresh_token,
      expiresAt: emailAccount.tokens.expires_at,
      emailAccountId,
    });

    messages = await getThreadMessages(threadId, gmail);
  } else {
    // Outlook: Use Outlook client to fetch messages
    const outlook = await getOutlookClientWithRefresh({
      accessToken: emailAccount.tokens.access_token,
      refreshToken: emailAccount.tokens.refresh_token,
      expiresAt: emailAccount.tokens.expires_at?.getTime() || null,
      emailAccountId,
    });

    // For Outlook, threadId is the conversationId
    // We need to fetch all messages in this conversation
    try {
      // Fetch the single message first
      const message = await getOutlookMessage(threadId, outlook);
      messages = [message];

      // TODO: In the future, we should fetch all messages in the conversation
      // using the conversationId to get the full thread context
    } catch (error) {
      logger.error("Failed to fetch Outlook message", {
        error,
        messageId: threadId,
      });
      throw new SafeError("Failed to fetch message");
    }
  }

  logger.info("Fetched messages", {
    emailAccountId,
    threadId,
    messageCount: messages.length,
  });

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return;

  await saveThread({
    emailAccountId,
    thread: {
      threadId,
      jobId,
      subject: lastMessage.headers.subject,
      from: lastMessage.headers.from,
      snippet: lastMessage.snippet,
      date: internalDateToDate(lastMessage.internalDate),
    },
  });

  const publish = getPublish({
    emailAccountId,
    threadId,
    markedDoneLabelId,
    processedLabelId,
    jobId,
    action,
    provider: emailAccount.account.provider,
  });

  // Provider-agnostic helper functions
  function isStarred(message: ParsedMessage) {
    // Gmail: check STARRED label
    // Outlook: check isFlagged or flagStatus (handled in message parsing)
    return message.labelIds?.includes(GmailLabel.STARRED) || message.isFlagged;
  }

  function isSent(message: ParsedMessage) {
    // Gmail: check SENT label
    // Outlook: check SENT label (we map this during parsing)
    return message.labelIds?.includes(GmailLabel.SENT);
  }

  function hasAttachments(message: ParsedMessage) {
    // Works for both providers
    return message.attachments && message.attachments.length > 0;
  }

  function hasUnsubscribeLink(message: ParsedMessage) {
    return (
      findUnsubscribeLink(message.textHtml) ||
      message.headers["list-unsubscribe"]
    );
  }

  function hasSentMail(message: ParsedMessage) {
    return message.labelIds?.includes(GmailLabel.SENT);
  }

  let needsLLMCheck = false;

  // Run through static rules before running against our LLM
  for (const message of messages) {
    // Skip if message is starred and skipStarred is true
    if (skips.starred && isStarred(message)) {
      await publish({ markDone: false });
      return;
    }

    // Skip conversations
    if (skips.conversation && isSent(message)) {
      await publish({ markDone: false });
      return;
    }

    // Skip if message has attachments and skipAttachment is true
    if (skips.attachment && hasAttachments(message)) {
      await publish({ markDone: false });
      return;
    }

    // receipt
    if (skips.receipt) {
      if (isReceipt(message)) {
        await publish({ markDone: false });
        return;
      }

      if (isMaybeReceipt(message)) {
        // check with llm
        needsLLMCheck = true;
        break;
      }
    }

    // calendar invite
    const calendarEventStatus = getCalendarEventStatus(message);
    if (skips.calendar && calendarEventStatus.isEvent) {
      if (calendarEventStatus.timing === "past") {
        await publish({ markDone: true });
        return;
      }

      if (calendarEventStatus.timing === "future") {
        await publish({ markDone: false });
        return;
      }
    }

    // unsubscribe link
    if (!hasSentMail(message) && hasUnsubscribeLink(message)) {
      await publish({ markDone: true });
      return;
    }

    // newsletter
    if (!hasSentMail(message) && isNewsletterSender(message.headers.from)) {
      await publish({ markDone: true });
      return;
    }
  }

  // promotion/social/update (Gmail-specific categories)
  // For Outlook, these categories don't exist, so we skip this check
  if (!needsLLMCheck && lastMessage.labelIds?.length) {
    const hasGmailCategory = lastMessage.labelIds.some(
      (label) =>
        label === GmailLabel.SOCIAL ||
        label === GmailLabel.PROMOTIONS ||
        label === GmailLabel.UPDATES ||
        label === GmailLabel.FORUMS,
    );

    if (hasGmailCategory) {
      await publish({ markDone: true });
      return;
    }
  }

  // llm check
  const aiResult = await aiClean({
    emailAccount,
    messageId: lastMessage.id,
    messages: messages.map((m) => getEmailForLLM(m)),
    instructions,
    skips,
  });

  await publish({ markDone: aiResult.archive });
}

function getPublish({
  emailAccountId,
  threadId,
  markedDoneLabelId,
  processedLabelId,
  jobId,
  action,
  provider,
}: {
  emailAccountId: string;
  threadId: string;
  markedDoneLabelId: string;
  processedLabelId: string;
  jobId: string;
  action: CleanAction;
  provider: string;
}) {
  return async ({ markDone }: { markDone: boolean }) => {
    // max rate:
    // Gmail: https://developers.google.com/gmail/api/reference/quota
    // 15,000 quota units per user per minute
    // modify thread = 10 units
    // => 25 modify threads per second
    // => assume user has other actions too => max 12 per second
    //
    // Outlook: https://learn.microsoft.com/en-us/graph/throttling
    // Different throttling limits apply, but we'll use conservative rate
    const actionCount = 2; // 1. remove "inbox" label/move folder. 2. label "clean"/mark read
    const maxRatePerSecond = Math.ceil(12 / actionCount);

    // Route to correct endpoint based on provider
    const isGmail = isGoogleProvider(provider);
    const endpoint = isGmail ? "/api/clean/gmail" : "/api/clean/outlook";
    const queueKey = isGmail
      ? `gmail-action-${emailAccountId}`
      : `outlook-action-${emailAccountId}`;

    const cleanBody: CleanGmailBody | CleanOutlookBody = {
      emailAccountId,
      threadId,
      markDone,
      action,
      markedDoneLabelId,
      processedLabelId,
      jobId,
    };

    logger.info("Publishing to Qstash", {
      emailAccountId,
      threadId,
      maxRatePerSecond,
      markDone,
      provider,
      endpoint,
    });

    await Promise.all([
      publishToQstash(endpoint, cleanBody, {
        key: queueKey,
        ratePerSecond: maxRatePerSecond,
      }),
      updateThread({
        emailAccountId,
        jobId,
        threadId,
        update: {
          archive: markDone,
          status: "applying",
          // label: "",
        },
      }),
    ]);

    logger.info("Published to Qstash", { emailAccountId, threadId, endpoint });
  };
}

export const POST = withError(
  verifySignatureAppRouter(async (request: Request) => {
    const json = await request.json();
    const body = cleanThreadBody.parse(json);

    await cleanThread(body);

    return NextResponse.json({ success: true });
  }),
);
