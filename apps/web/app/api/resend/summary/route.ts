import { NextResponse } from "next/server";
import { subHours } from "date-fns/subHours";
import { sendSummaryEmail } from "@inboxzero/resend";
import { withEmailAccount, withError } from "@/utils/middleware";
import { env } from "@/env";
import { hasCronSecret } from "@/utils/cron";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { captureException } from "@/utils/error";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import {
  ActionType,
  ExecutedRuleStatus,
  ScheduledActionStatus,
  SystemType,
  ThreadTrackerType,
} from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { decodeSnippet } from "@/utils/gmail/decode";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { sendSummaryEmailBody } from "./validation";
import { createEmailProvider } from "@/utils/email/provider";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { ParsedMessage } from "@/utils/types";
import {
  ARCHIVED_EMAIL_DISPLAY_LIMIT,
  buildArchivedEmailSummaryItems,
} from "./archived-emails";

export const maxDuration = 60;

export const GET = withEmailAccount("resend/summary", async (request) => {
  // send to self
  const emailAccountId = request.auth.emailAccountId;

  request.logger.info("Sending summary email to user GET", { emailAccountId });

  const result = await sendEmail({
    emailAccountId,
    force: true,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

export const POST = withError("resend/summary", async (request) => {
  const logger = request.logger;
  if (
    !hasCronSecret(request) &&
    !isValidInternalApiKey(request.headers, logger)
  ) {
    logger.error("Unauthorized cron request");
    captureException(new Error("Unauthorized cron request: resend"));
    return new Response("Unauthorized", { status: 401 });
  }

  const json = await request.json();
  const { success, data, error } = sendSummaryEmailBody.safeParse(json);

  if (!success) {
    logger.error("Invalid request body", { error });
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const { emailAccountId } = data;

  logger.info("Sending summary email to user POST", { emailAccountId });

  try {
    await sendEmail({ emailAccountId, logger });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error sending summary email", { error });
    captureException(error);
    return NextResponse.json(
      { success: false, error: "Error sending summary email" },
      { status: 500 },
    );
  }
});

async function sendEmail({
  emailAccountId,
  force,
  logger,
}: {
  emailAccountId: string;
  force?: boolean;
  logger: Logger;
}) {
  logger = logger.with({ emailAccountId, force });

  logger.info("Sending summary email");

  // run every 7 days. but overlap by 1 hour
  const days = 7;
  const cutOffDate = subHours(new Date(), days * 24 + 1);

  if (!force) {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { lastSummaryEmailAt: true },
    });

    if (!emailAccount) {
      logger.error("Email account not found");
      return { success: true };
    }

    const lastSummaryEmailAt = emailAccount.lastSummaryEmailAt;

    if (lastSummaryEmailAt && lastSummaryEmailAt > cutOffDate) {
      logger.info("Last summary email was recent", {
        lastSummaryEmailAt,
        cutOffDate,
      });
      return { success: true };
    }
  }

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      userId: true,
      email: true,
      account: {
        select: {
          provider: true,
          refresh_token: true,
        },
      },
    },
  });

  if (!emailAccount) {
    logger.error("Email account not found");
    return { success: false };
  }

  logger = logger.with({ userId: emailAccount.userId });

  const coldEmailRule = await prisma.rule.findUnique({
    where: {
      emailAccountId_systemType: {
        emailAccountId,
        systemType: SystemType.COLD_EMAIL,
      },
    },
    select: { id: true },
  });

  const archivedActionWhere = {
    type: ActionType.ARCHIVE,
    createdAt: { gt: cutOffDate },
    executedRule: {
      emailAccountId,
      automated: true,
    },
    OR: [
      {
        scheduledAction: {
          is: { status: ScheduledActionStatus.COMPLETED },
        },
      },
      {
        scheduledAction: { is: null },
        executedRule: { status: ExecutedRuleStatus.APPLIED },
      },
    ],
  } satisfies Prisma.ExecutedActionWhereInput;

  // Get counts and recent threads for each type
  const [
    counts,
    needsReply,
    awaitingReply,
    coldExecutedRules,
    archivedEmailCount,
    archivedActions,
  ] = await Promise.all([
    // total count
    // NOTE: should really be distinct by threadId. this will cause a mismatch in some cases
    prisma.threadTracker.groupBy({
      by: ["type"],
      where: {
        emailAccountId,
        resolved: false,
      },
      _count: true,
    }),
    // needs reply
    prisma.threadTracker.findMany({
      where: {
        emailAccountId,
        type: ThreadTrackerType.NEEDS_REPLY,
        resolved: false,
      },
      orderBy: { sentAt: "desc" },
      take: 20,
      distinct: ["threadId"],
    }),
    // awaiting reply
    prisma.threadTracker.findMany({
      where: {
        emailAccountId,
        type: ThreadTrackerType.AWAITING,
        resolved: false,
        // only show emails that are more than 3 days overdue
        sentAt: { lt: subHours(new Date(), 24 * 3) },
      },
      orderBy: { sentAt: "desc" },
      take: 20,
      distinct: ["threadId"],
    }),
    // cold emails
    coldEmailRule
      ? prisma.executedRule.findMany({
          where: {
            ruleId: coldEmailRule.id,
            automated: true,
            createdAt: { gt: cutOffDate },
          },
          select: {
            messageId: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.executedAction.count({
      where: archivedActionWhere,
    }),
    prisma.executedAction.findMany({
      where: archivedActionWhere,
      orderBy: { createdAt: "desc" },
      take: ARCHIVED_EMAIL_DISPLAY_LIMIT,
      select: {
        id: true,
        createdAt: true,
        executedRule: {
          select: {
            messageId: true,
            rule: {
              select: {
                name: true,
                systemType: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const typeCounts = Object.fromEntries(
    counts.map((count) => [count.type, count._count]),
  );

  // get messages
  const messageIds = [
    ...needsReply.map((m) => m.messageId),
    ...awaitingReply.map((m) => m.messageId),
    ...coldExecutedRules.map((r) => r.messageId),
    ...archivedActions.map((a) => a.executedRule.messageId),
  ];

  logger.info("Getting messages", {
    messagesCount: messageIds.length,
  });

  const messages = await getMessages({
    emailAccountId,
    provider: emailAccount.account.provider,
    hasRefreshToken: !!emailAccount.account.refresh_token,
    messageIds,
    logger,
  });

  const messageMap = Object.fromEntries(
    messages.map((message) => [message.id, message]),
  );

  const recentNeedsReply = needsReply.map((t) => {
    const message = messageMap[t.messageId];
    return {
      from: message?.headers.from || "Unknown",
      subject: decodeSnippet(message?.snippet) || "",
      sentAt: t.sentAt,
    };
  });

  const recentAwaitingReply = awaitingReply.map((t) => {
    const message = messageMap[t.messageId];
    return {
      from: message?.headers.to || "Unknown",
      subject: decodeSnippet(message?.snippet) || "",
      sentAt: t.sentAt,
    };
  });

  const coldEmailers = coldExecutedRules.map((r) => {
    const message = messageMap[r.messageId];
    return {
      from: message?.headers.from || "Unknown",
      subject: decodeSnippet(message?.snippet) || "",
      sentAt: r.createdAt,
    };
  });

  const archivedEmails = buildArchivedEmailSummaryItems({
    archivedActions,
    messageMap,
  });

  const shouldSendEmail = !!(
    archivedEmailCount ||
    coldEmailers.length ||
    typeCounts[ThreadTrackerType.NEEDS_REPLY] ||
    typeCounts[ThreadTrackerType.AWAITING] ||
    typeCounts[ThreadTrackerType.NEEDS_ACTION]
  );

  logger.info("Sending summary email to user", {
    shouldSendEmail,
    archivedEmailCount,
    archivedEmailsShown: archivedEmails.length,
    coldEmailers: coldEmailers.length,
    needsReplyCount: typeCounts[ThreadTrackerType.NEEDS_REPLY],
    awaitingReplyCount: typeCounts[ThreadTrackerType.AWAITING],
    needsActionCount: typeCounts[ThreadTrackerType.NEEDS_ACTION],
  });

  async function sendEmail({
    emailAccountId,
    userEmail,
  }: {
    emailAccountId: string;
    userEmail: string;
  }) {
    const token = await createUnsubscribeToken({ emailAccountId });

    return sendSummaryEmail({
      from: env.RESEND_FROM_EMAIL,
      to: userEmail,
      emailProps: {
        baseUrl: env.NEXT_PUBLIC_BASE_URL,
        archivedEmailCount,
        archivedEmails,
        coldEmailers,
        needsReplyCount: typeCounts[ThreadTrackerType.NEEDS_REPLY],
        awaitingReplyCount: typeCounts[ThreadTrackerType.AWAITING],
        needsActionCount: typeCounts[ThreadTrackerType.NEEDS_ACTION],
        needsReply: recentNeedsReply,
        awaitingReply: recentAwaitingReply,
        unsubscribeToken: token,
      },
    });
  }

  await Promise.all([
    shouldSendEmail
      ? sendEmail({ emailAccountId, userEmail: emailAccount.email })
      : Promise.resolve(),
    prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { lastSummaryEmailAt: new Date() },
    }),
  ]);

  return { success: true };
}

async function getMessages({
  emailAccountId,
  provider,
  hasRefreshToken,
  messageIds,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  hasRefreshToken: boolean;
  messageIds: string[];
  logger: Logger;
}): Promise<ParsedMessage[]> {
  const uniqueMessageIds = Array.from(new Set(messageIds)).filter(Boolean);
  if (!uniqueMessageIds.length) return [];

  if (!hasRefreshToken) {
    logger.warn("Skipping summary message fetch: account has no refresh token");
    return [];
  }

  if (!isGoogleProvider(provider) && !isMicrosoftProvider(provider)) {
    logger.warn("Skipping summary message fetch: unsupported provider", {
      provider,
    });
    return [];
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  const messages: ParsedMessage[] = [];
  const batchSize = 100;

  for (let i = 0; i < uniqueMessageIds.length; i += batchSize) {
    const batch = uniqueMessageIds.slice(i, i + batchSize);
    messages.push(...(await emailProvider.getMessagesBatch(batch)));
  }

  return messages;
}
