import { NextResponse } from "next/server";
import { subHours } from "date-fns/subHours";
import { sendSummaryEmail } from "@inboxzero/resend";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { SystemType, ThreadTrackerType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { getMessagesBatch } from "@/utils/gmail/message";
import { decodeSnippet } from "@/utils/gmail/decode";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { sendSummaryEmailBody } from "./validation";
import type { RequestWithLogger } from "@/utils/middleware";
import { captureException } from "@/utils/error";

export async function handleSummaryRequest(
  request: RequestWithLogger,
): Promise<NextResponse> {
  const logger = request.logger;

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
}

export async function sendEmail({
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
      email: true,
      account: {
        select: {
          access_token: true,
        },
      },
    },
  });

  if (!emailAccount) {
    logger.error("Email account not found");
    return { success: false };
  }

  const coldEmailRule = await prisma.rule.findUnique({
    where: {
      emailAccountId_systemType: {
        emailAccountId,
        systemType: SystemType.COLD_EMAIL,
      },
    },
    select: { id: true },
  });

  const [counts, needsReply, awaitingReply, coldExecutedRules] =
    await Promise.all([
      prisma.threadTracker.groupBy({
        by: ["type"],
        where: {
          emailAccountId,
          resolved: false,
        },
        _count: true,
      }),
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
      prisma.threadTracker.findMany({
        where: {
          emailAccountId,
          type: ThreadTrackerType.AWAITING,
          resolved: false,
          sentAt: { lt: subHours(new Date(), 24 * 3) },
        },
        orderBy: { sentAt: "desc" },
        take: 20,
        distinct: ["threadId"],
      }),
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
    ]);

  const typeCounts = Object.fromEntries(
    counts.map((count) => [count.type, count._count]),
  );

  const messageIds = [
    ...needsReply.map((m) => m.messageId),
    ...awaitingReply.map((m) => m.messageId),
    ...coldExecutedRules.map((r) => r.messageId),
  ];

  logger.info("Getting messages", {
    messagesCount: messageIds.length,
  });

  const messages = emailAccount.account.access_token
    ? await getMessagesBatch({
        messageIds,
        accessToken: emailAccount.account.access_token,
      })
    : [];

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

  const shouldSendEmail = !!(
    coldEmailers.length ||
    typeCounts[ThreadTrackerType.NEEDS_REPLY] ||
    typeCounts[ThreadTrackerType.AWAITING] ||
    typeCounts[ThreadTrackerType.NEEDS_ACTION]
  );

  logger.info("Sending summary email to user", {
    shouldSendEmail,
    coldEmailers: coldEmailers.length,
    needsReplyCount: typeCounts[ThreadTrackerType.NEEDS_REPLY],
    awaitingReplyCount: typeCounts[ThreadTrackerType.AWAITING],
    needsActionCount: typeCounts[ThreadTrackerType.NEEDS_ACTION],
  });

  async function sendEmailToUser({
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
      ? sendEmailToUser({ emailAccountId, userEmail: emailAccount.email })
      : Promise.resolve(),
    prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { lastSummaryEmailAt: new Date() },
    }),
  ]);

  return { success: true };
}
