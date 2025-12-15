import { z } from "zod";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { withError, type RequestWithLogger } from "@/utils/middleware";
import { publishToQstash } from "@/utils/upstash";
import { getThreadMessages } from "@/utils/gmail/thread";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
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
import { CleanAction } from "@/generated/prisma/enums";
import type { ParsedMessage } from "@/utils/types";
import { isActivePremium } from "@/utils/premium";
import { env } from "@/env";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { sleep } from "@/utils/sleep";

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
});
type CleanThreadBody = z.infer<typeof cleanThreadBody>;

type CleanGmailBody = {
  emailAccountId: string;
  threadId: string;
  markDone: boolean;
  action: CleanAction;
  markedDoneLabelId?: string;
  processedLabelId?: string;
  jobId: string;
};

/**
 * Processes a Gmail thread for the Deep Clean feature.
 * Applies static rules (starred, attachments, receipts, calendar, newsletters)
 * before falling back to LLM-based decision making.
 */
async function cleanThread({
  emailAccountId,
  threadId,
  markedDoneLabelId,
  processedLabelId,
  jobId,
  action,
  instructions,
  skips,
  logger,
}: CleanThreadBody & { logger: Logger }) {
  const emailAccount = await getEmailAccountWithAiAndTokens({
    emailAccountId,
  });

  if (!emailAccount) throw new SafeError("User not found", 404);

  if (!emailAccount.tokens) throw new SafeError("No Gmail account found", 404);
  if (!emailAccount.tokens.access_token || !emailAccount.tokens.refresh_token)
    throw new SafeError("No Gmail account found", 404);

  const premium = await getUserPremium({ userId: emailAccount.userId });
  if (!isActivePremium(premium)) throw new SafeError("User not premium");

  const gmail = await getGmailClientWithRefresh({
    accessToken: emailAccount.tokens.access_token,
    refreshToken: emailAccount.tokens.refresh_token,
    expiresAt: emailAccount.tokens.expires_at,
    emailAccountId,
  });

  const messages = await getThreadMessages(threadId, gmail);

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
    logger,
  });

  function isStarred(message: ParsedMessage) {
    return message.labelIds?.includes(GmailLabel.STARRED);
  }

  function isSent(message: ParsedMessage) {
    return message.labelIds?.includes(GmailLabel.SENT);
  }

  function hasAttachments(message: ParsedMessage) {
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

  // promotion/social/update
  if (
    !needsLLMCheck &&
    lastMessage.labelIds?.some(
      (label) =>
        label === GmailLabel.SOCIAL ||
        label === GmailLabel.PROMOTIONS ||
        label === GmailLabel.UPDATES ||
        label === GmailLabel.FORUMS,
    )
  ) {
    await publish({ markDone: true });
    return;
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

/**
 * Creates a publish function that enqueues Gmail label changes.
 * Uses publishToQstash which has built-in fallback to /simple routes
 * when QStash is not configured.
 */
function getPublish({
  emailAccountId,
  threadId,
  markedDoneLabelId,
  processedLabelId,
  jobId,
  action,
  logger,
}: {
  emailAccountId: string;
  threadId: string;
  markedDoneLabelId: string;
  processedLabelId: string;
  jobId: string;
  action: CleanAction;
  logger: Logger;
}) {
  return async ({ markDone }: { markDone: boolean }) => {
    // Gmail API rate limits: https://developers.google.com/gmail/api/reference/quota
    // 15,000 quota units per user per minute, modify thread = 10 units
    // => ~25 modify threads/second max, with headroom => 12/second
    // Each clean operation does 2 label modifications (remove inbox + add processed)
    const actionCount = 2;
    const maxRatePerSecond = Math.ceil(12 / actionCount);

    const cleanGmailBody: CleanGmailBody = {
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
    });

    await Promise.all([
      publishToQstash("/api/clean/gmail", cleanGmailBody, {
        key: `gmail-action-${emailAccountId}`,
        ratePerSecond: maxRatePerSecond,
      }),
      updateThread({
        emailAccountId,
        jobId,
        threadId,
        update: {
          archive: markDone,
          status: "applying",
        },
      }),
    ]);

    // Rate limiting for fallback path (when QStash is not configured).
    // QStash handles rate limiting server-side; fallback needs explicit delay.
    // ~167ms = 6 operations/second to stay within Gmail API quotas.
    if (!env.QSTASH_TOKEN) {
      await sleep(167);
    }

    logger.info("Published to Qstash", { emailAccountId, threadId });
  };
}

// Alternative endpoint for self-hosted deployments without Qstash.
// Disabled when QSTASH_TOKEN is set (returns 403).
// Authenticates via internal API key instead of Qstash signature verification.
//
// Security note: The internal API key provides blanket access to all email accounts.
// This mirrors the QStash routes which trust signed requests without per-account validation.
// The internal API key is a trusted service credential for self-hosted deployments.
export const POST = withError("clean/simple", async (request: Request) => {
  if (env.QSTASH_TOKEN) {
    return NextResponse.json(
      { error: "Qstash is set. This endpoint is disabled." },
      { status: 403 },
    );
  }

  const requestLogger = (request as RequestWithLogger).logger;

  if (!isValidInternalApiKey(await headers(), requestLogger)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const json = await request.json();
  const body = cleanThreadBody.parse(json);

  await cleanThread({
    ...body,
    logger: requestLogger,
  });

  return NextResponse.json({ success: true });
});
