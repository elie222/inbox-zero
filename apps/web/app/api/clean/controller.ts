import { z } from "zod";
import type { CleanGmailBody } from "@/app/api/clean/gmail/route";
import { CleanAction } from "@/generated/prisma/enums";
import { aiClean } from "@/utils/ai/clean/ai-clean";
import { isNewsletterSender } from "@/utils/ai/group/find-newsletters";
import { isMaybeReceipt, isReceipt } from "@/utils/ai/group/find-receipts";
import { assertCleanerApiEnabled } from "@/utils/cleaner-feature";
import { internalDateToDate } from "@/utils/date";
import { SafeError } from "@/utils/error";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { GmailLabel } from "@/utils/gmail/label";
import { getThreadMessages } from "@/utils/gmail/thread";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { Logger } from "@/utils/logger";
import { getCalendarEventStatus } from "@/utils/parse/calender-event";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { isActivePremium } from "@/utils/premium";
import { saveThread, updateThread } from "@/utils/redis/clean";
import type { ParsedMessage } from "@/utils/types";
import { publishToQstash } from "@/utils/upstash";
import {
  getEmailAccountWithAiAndTokens,
  getUserPremium,
} from "@/utils/user/get";

export const cleanThreadBody = z.object({
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

export async function cleanThread({
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
  assertCleanerApiEnabled();

  const emailAccount = await getEmailAccountWithAiAndTokens({
    emailAccountId,
  });

  if (!emailAccount) throw new SafeError("User not found", 404);

  if (!emailAccount.tokens) throw new SafeError("No Gmail account found", 404);
  if (!emailAccount.tokens.access_token || !emailAccount.tokens.refresh_token)
    throw new SafeError("No Gmail account found", 404);

  const premium = await getUserPremium({ userId: emailAccount.userId });
  if (!premium) throw new SafeError("User not premium");
  if (!isActivePremium(premium)) throw new SafeError("Premium not active");

  const gmail = await getGmailClientWithRefresh({
    accessToken: emailAccount.tokens.access_token,
    refreshToken: emailAccount.tokens.refresh_token,
    expiresAt: emailAccount.tokens.expires_at,
    emailAccountId,
    logger,
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

  let needsLLMCheck = false;

  for (const message of messages) {
    if (skips.starred && isStarred(message)) {
      await publish({ markDone: false });
      return;
    }

    if (skips.conversation && isSent(message)) {
      await publish({ markDone: false });
      return;
    }

    if (skips.attachment && hasAttachments(message)) {
      await publish({ markDone: false });
      return;
    }

    if (skips.receipt) {
      if (isReceipt(message)) {
        await publish({ markDone: false });
        return;
      }

      if (isMaybeReceipt(message)) {
        needsLLMCheck = true;
      }
    }

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

    if (!isSent(message) && hasUnsubscribeLink(message)) {
      await publish({ markDone: true });
      return;
    }

    if (!isSent(message) && isNewsletterSender(message.headers.from)) {
      await publish({ markDone: true });
      return;
    }
  }

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
    const actionCount = 2;
    const maxRatePerSecond = Math.ceil(12 / actionCount);

    const cleanGmailBody: CleanGmailBody = {
      emailAccountId,
      threadId,
      markDone,
      action,
      // label: aiResult.label,
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
          // label: "",
        },
      }),
    ]);

    logger.info("Published to Qstash", { emailAccountId, threadId });
  };
}
