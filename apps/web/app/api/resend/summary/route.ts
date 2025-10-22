import { z } from "zod";
import { NextResponse } from "next/server";
import subHours from "date-fns/subHours";
import { sendSummaryEmail } from "@inboxzero/resend";
import { withEmailAccount, withError } from "@/utils/middleware";
import { env } from "@/env";
import { hasCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import prisma from "@/utils/prisma";
import { ThreadTrackerType } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { getMessagesBatch } from "@/utils/gmail/message";
import { decodeSnippet } from "@/utils/gmail/decode";
import { createUnsubscribeToken } from "@/utils/unsubscribe";

export const maxDuration = 60;

const sendSummaryEmailBody = z.object({ emailAccountId: z.string() });

async function sendEmail({
  emailAccountId,
  force,
}: {
  emailAccountId: string;
  force?: boolean;
}) {
  const logger = createScopedLogger("resend/summary").with({
    emailAccountId,
    force,
  });

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
      email: true,
      coldEmails: { where: { createdAt: { gt: cutOffDate } } },
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

  if (emailAccount) {
    logger.info("Email account found");
  } else {
    logger.error("Email account not found or cutoff date is in the future", {
      cutOffDate,
    });
    return { success: true };
  }

  // Get counts and recent threads for each type
  const [
    counts,
    needsReply,
    awaitingReply,
    // needsAction
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
    // needs action - currently not used
    // prisma.threadTracker.findMany({
    //   where: {
    //     userId: user.id,
    //     type: ThreadTrackerType.NEEDS_ACTION,
    //     resolved: false,
    //   },
    //   orderBy: { sentAt: "desc" },
    //   take: 20,
    //   distinct: ["threadId"],
    // }),
  ]);

  const typeCounts = Object.fromEntries(
    counts.map((count) => [count.type, count._count]),
  );

  const coldEmailers = emailAccount.coldEmails.map((e) => ({
    from: e.fromEmail,
    subject: "",
    sentAt: e.createdAt,
  }));

  // get messages
  const messageIds = [
    ...needsReply.map((m) => m.messageId),
    ...awaitingReply.map((m) => m.messageId),
    // ...needsAction.map((m) => m.messageId),
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

  // const recentNeedsAction = needsAction.map((t) => {
  //   const message = messageMap[t.messageId];
  //   return {
  //     from: message?.headers.from || "Unknown",
  //     subject: decodeSnippet(message?.snippet) || "",
  //     sentAt: t.sentAt,
  //   };
  // });

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
        coldEmailers,
        needsReplyCount: typeCounts[ThreadTrackerType.NEEDS_REPLY],
        awaitingReplyCount: typeCounts[ThreadTrackerType.AWAITING],
        needsActionCount: typeCounts[ThreadTrackerType.NEEDS_ACTION],
        needsReply: recentNeedsReply,
        awaitingReply: recentAwaitingReply,
        // needsAction: recentNeedsAction,
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

export const GET = withEmailAccount(async (request) => {
  // send to self
  const logger = createScopedLogger("resend/summary");
  const emailAccountId = request.auth.emailAccountId;

  logger.info("Sending summary email to user GET", { emailAccountId });

  const result = await sendEmail({ emailAccountId, force: true });

  return NextResponse.json(result);
});

export const POST = withError(async (request) => {
  const logger = createScopedLogger("resend/summary");

  if (!hasCronSecret(request)) {
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
    await sendEmail({ emailAccountId });
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
