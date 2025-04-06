import { verifySignatureAppRouter } from "@upstash/qstash/dist/nextjs";
import { z } from "zod";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { publishToQstash } from "@/utils/upstash";
import { getThreadMessages } from "@/utils/gmail/thread";
import { getGmailClient } from "@/utils/gmail/client";
import type { CleanGmailBody } from "@/app/api/clean/gmail/route";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { aiClean } from "@/utils/ai/clean/ai-clean";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { getAiUserWithTokens } from "@/utils/user/get";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { getCalendarEventStatus } from "@/utils/parse/calender-event";
import { GmailLabel } from "@/utils/gmail/label";
import { isNewsletterSender } from "@/utils/ai/group/find-newsletters";
import { isMaybeReceipt, isReceipt } from "@/utils/ai/group/find-receipts";
import { saveThread, updateThread } from "@/utils/redis/clean";
import { internalDateToDate } from "@/utils/date";
import { CleanAction } from "@prisma/client";
import type { ParsedMessage } from "@/utils/types";

const logger = createScopedLogger("api/clean");

const cleanThreadBody = z.object({
  userId: z.string(),
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
  labels: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});
export type CleanThreadBody = z.infer<typeof cleanThreadBody>;

async function cleanThread({
  userId,
  threadId,
  markedDoneLabelId,
  processedLabelId,
  jobId,
  action,
  instructions,
  skips,
  labels,
}: CleanThreadBody) {
  // 1. get thread with messages
  // 2. process thread with ai / fixed logic
  // 3. add to gmail action queue

  const user = await getAiUserWithTokens({ id: userId });

  if (!user) throw new SafeError("User not found", 404);

  if (!user.tokens) throw new SafeError("No Gmail account found", 404);
  if (!user.tokens.access_token || !user.tokens.refresh_token)
    throw new SafeError("No Gmail account found", 404);

  const gmail = getGmailClient({
    accessToken: user.tokens.access_token,
    refreshToken: user.tokens.refresh_token,
  });

  const messages = await getThreadMessages(threadId, gmail);

  logger.info("Fetched messages", {
    userId,
    threadId,
    messageCount: messages.length,
  });

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return;

  await saveThread(userId, {
    threadId,
    jobId,
    subject: lastMessage.headers.subject,
    from: lastMessage.headers.from,
    snippet: lastMessage.snippet,
    date: internalDateToDate(lastMessage.internalDate),
  });

  const publish = getPublish({
    userId,
    threadId,
    markedDoneLabelId,
    processedLabelId,
    jobId,
    action,
  });

  function isStarred(message: ParsedMessage) {
    return message.labelIds?.includes(GmailLabel.STARRED);
  }

  function isSent(message: ParsedMessage) {
    return message.labelIds?.includes(GmailLabel.SENT);
  }

  function hasAttachments(message: ParsedMessage) {
    return message.payload?.parts?.some((part) => part.filename);
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
    user,
    messageId: lastMessage.id,
    messages: messages.map((m) => getEmailForLLM(m)),
    instructions,
    skips,
  });

  await publish({ markDone: aiResult.archive });
}

function getPublish({
  userId,
  threadId,
  markedDoneLabelId,
  processedLabelId,
  jobId,
  action,
}: {
  userId: string;
  threadId: string;
  markedDoneLabelId: string;
  processedLabelId: string;
  jobId: string;
  action: CleanAction;
}) {
  return async ({ markDone }: { markDone: boolean }) => {
    // max rate:
    // https://developers.google.com/gmail/api/reference/quota
    // 15,000 quota units per user per minute
    // modify thread = 10 units
    // => 25 modify threads per second
    // => assume user has other actions too => max 12 per second
    const actionCount = 2; // 1. remove "inbox" label. 2. label "clean". increase if we're doing multiple labellings
    const maxRatePerSecond = Math.ceil(12 / actionCount);

    const cleanGmailBody: CleanGmailBody = {
      userId,
      threadId,
      markDone,
      action,
      // label: aiResult.label,
      markedDoneLabelId,
      processedLabelId,
      jobId,
    };

    logger.info("Publishing to Qstash", {
      userId,
      threadId,
      maxRatePerSecond,
      markDone,
    });

    await Promise.all([
      publishToQstash("/api/clean/gmail", cleanGmailBody, {
        key: `gmail-action-${userId}`,
        ratePerSecond: maxRatePerSecond,
      }),
      updateThread(userId, jobId, threadId, {
        archive: markDone,
        status: "applying",
        // label: "",
      }),
    ]);

    logger.info("Published to Qstash", { userId, threadId });
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
