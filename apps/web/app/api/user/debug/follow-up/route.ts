import { NextResponse } from "next/server";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type DebugFollowUpResponse = Awaited<ReturnType<typeof getFollowUpDebugData>>;

export const GET = withEmailAccount("user/debug/follow-up", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getFollowUpDebugData({ emailAccountId });
  return NextResponse.json(result);
});

async function getFollowUpDebugData({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: emailAccountId },
    select: {
      id: true,
      email: true,
      followUpAwaitingReplyDays: true,
      followUpNeedsReplyDays: true,
      followUpAutoDraftEnabled: true,
    },
  });

  const followUpTypes = [ThreadTrackerType.AWAITING, ThreadTrackerType.NEEDS_REPLY];

  const [
    unresolvedTrackers,
    unresolvedAwaitingTrackers,
    unresolvedNeedsReplyTrackers,
    unresolvedWithFollowUpApplied,
    unresolvedWithFollowUpDraft,
    lastFollowUpApplied,
    lastTrackerActivity,
    recentFollowUpTrackers,
  ] = await Promise.all([
    prisma.threadTracker.count({
      where: {
        emailAccountId,
        resolved: false,
        type: { in: followUpTypes },
      },
    }),
    prisma.threadTracker.count({
      where: {
        emailAccountId,
        resolved: false,
        type: ThreadTrackerType.AWAITING,
      },
    }),
    prisma.threadTracker.count({
      where: {
        emailAccountId,
        resolved: false,
        type: ThreadTrackerType.NEEDS_REPLY,
      },
    }),
    prisma.threadTracker.count({
      where: {
        emailAccountId,
        resolved: false,
        type: { in: followUpTypes },
        followUpAppliedAt: { not: null },
      },
    }),
    prisma.threadTracker.count({
      where: {
        emailAccountId,
        resolved: false,
        type: { in: followUpTypes },
        followUpDraftId: { not: null },
      },
    }),
    prisma.threadTracker.aggregate({
      where: {
        emailAccountId,
        type: { in: followUpTypes },
        followUpAppliedAt: { not: null },
      },
      _max: {
        followUpAppliedAt: true,
      },
    }),
    prisma.threadTracker.aggregate({
      where: {
        emailAccountId,
        type: { in: followUpTypes },
      },
      _max: {
        updatedAt: true,
      },
    }),
    prisma.threadTracker.findMany({
      where: {
        emailAccountId,
        type: { in: followUpTypes },
        OR: [{ followUpAppliedAt: { not: null } }, { followUpDraftId: { not: null } }],
      },
      select: {
        id: true,
        type: true,
        threadId: true,
        messageId: true,
        sentAt: true,
        resolved: true,
        followUpAppliedAt: true,
        followUpDraftId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    emailAccount,
    summary: {
      unresolvedTrackers,
      unresolvedAwaitingTrackers,
      unresolvedNeedsReplyTrackers,
      unresolvedWithFollowUpApplied,
      unresolvedWithFollowUpDraft,
      lastFollowUpAppliedAt: lastFollowUpApplied._max.followUpAppliedAt,
      lastTrackerActivityAt: lastTrackerActivity._max.updatedAt,
    },
    recentFollowUpTrackers,
    generatedAt: new Date().toISOString(),
  };
}
