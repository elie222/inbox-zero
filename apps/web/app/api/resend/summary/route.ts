import { z } from "zod";
import { NextResponse } from "next/server";
import { subHours } from "date-fns";
import { sendSummaryEmail } from "@inboxzero/resend";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { hasCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus } from "@prisma/client";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { ThreadTrackerType } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("resend/summary");

const sendSummaryEmailBody = z.object({ email: z.string() });

async function sendEmail({ email }: { email: string }) {
  // run every 7 days. but overlap by 1 hour
  const days = 7;
  const cutOffDate = subHours(new Date(), days * 24 + 1);

  const user = await prisma.user.findUnique({
    where: {
      email,
      OR: [
        { lastSummaryEmailAt: { lt: cutOffDate } },
        { lastSummaryEmailAt: null },
      ],
    },
    select: {
      id: true,
      coldEmails: { where: { createdAt: { gt: cutOffDate } } },
      _count: {
        select: {
          executedRules: {
            where: {
              status: ExecutedRuleStatus.PENDING,
              createdAt: { gt: cutOffDate },
            },
          },
        },
      },
    },
  });

  if (!user) return { success: false };

  // Get counts and recent threads for each type
  const [counts, needsReply, awaitingReply, needsAction] = await Promise.all([
    prisma.threadTracker.groupBy({
      by: ["type"],
      where: {
        userId: user.id,
        resolved: false,
        sentAt: { gt: cutOffDate },
      },
      _count: true,
    }),
    prisma.threadTracker.findMany({
      where: {
        userId: user.id,
        type: ThreadTrackerType.NEEDS_REPLY,
        resolved: false,
        sentAt: { gt: cutOffDate },
      },
      orderBy: { sentAt: "desc" },
      take: 5,
    }),
    prisma.threadTracker.findMany({
      where: {
        userId: user.id,
        type: ThreadTrackerType.AWAITING,
        resolved: false,
        sentAt: { gt: cutOffDate },
      },
      orderBy: { sentAt: "desc" },
      take: 5,
    }),
    prisma.threadTracker.findMany({
      where: {
        userId: user.id,
        type: ThreadTrackerType.NEEDS_ACTION,
        resolved: false,
        sentAt: { gt: cutOffDate },
      },
      orderBy: { sentAt: "desc" },
      take: 5,
    }),
  ]);

  const typeCounts = Object.fromEntries(
    counts.map((count) => [count.type, count._count]),
  );

  const coldEmailers = user.coldEmails.map((e) => ({
    from: e.fromEmail,
    subject: "",
    sentAt: e.createdAt,
  }));
  const pendingCount = user._count.executedRules;

  const recentNeedsReply = needsReply.map((t) => ({
    from: t.messageId,
    subject: "",
    sentAt: t.sentAt,
  }));

  const recentAwaitingReply = awaitingReply.map((t) => ({
    from: t.messageId,
    subject: "",
    sentAt: t.sentAt,
  }));

  const recentNeedsAction = needsAction.map((t) => ({
    from: t.messageId,
    subject: "",
    sentAt: t.sentAt,
  }));

  const shouldSendEmail =
    coldEmailers.length ||
    pendingCount ||
    typeCounts[ThreadTrackerType.NEEDS_REPLY] ||
    typeCounts[ThreadTrackerType.AWAITING] ||
    typeCounts[ThreadTrackerType.NEEDS_ACTION];

  await Promise.all([
    shouldSendEmail
      ? sendSummaryEmail({
          to: email,
          emailProps: {
            baseUrl: env.NEXT_PUBLIC_BASE_URL,
            coldEmailers,
            pendingCount,
            needsReplyCount: typeCounts[ThreadTrackerType.NEEDS_REPLY],
            awaitingReplyCount: typeCounts[ThreadTrackerType.AWAITING],
            needsActionCount: typeCounts[ThreadTrackerType.NEEDS_ACTION],
            needsReply: recentNeedsReply,
            awaitingReply: recentAwaitingReply,
            needsAction: recentNeedsAction,
          },
        })
      : async () => {},
    prisma.user.update({
      where: { email },
      data: { lastSummaryEmailAt: new Date() },
    }),
  ]);

  return { success: true };
}

export const GET = withError(async () => {
  const session = await auth();

  // send to self
  const email = session?.user.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" });

  logger.info("Sending summary email to user", { email });

  const result = await sendEmail({ email });

  return NextResponse.json(result);
});

export const POST = withError(async (request: Request) => {
  logger.info("Sending summary email to user");

  if (!hasCronSecret(request)) {
    logger.error("Unauthorized cron request");
    captureException(new Error("Unauthorized cron request: resend"));
    return new Response("Unauthorized", { status: 401 });
  }

  const json = await request.json();
  const body = sendSummaryEmailBody.parse(json);

  const result = await sendEmail(body);

  return NextResponse.json(result);
});
