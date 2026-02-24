import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { withEmailAccount } from "@/utils/middleware";

export type GetSetupProgressResponse = Awaited<
  ReturnType<typeof getSetupProgress>
>;

export const GET = withEmailAccount("user/setup-progress", async (request) => {
  const { emailAccountId } = request.auth;
  const requestStartTime = Date.now();
  const slowRequestLogTimeout = setTimeout(() => {
    request.logger.warn("Setup progress request still running", {
      elapsedMs: Date.now() - requestStartTime,
    });
  }, 8000);

  try {
    const result = await getSetupProgress({ emailAccountId });
    const durationMs = Date.now() - requestStartTime;
    if (durationMs > 2000) {
      request.logger.warn("Setup progress request completed slowly", {
        durationMs,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    request.logger.error("Error fetching setup progress", {
      error,
      durationMs: Date.now() - requestStartTime,
    });
    return NextResponse.json(
      { error: "Failed to fetch setup progress" },
      { status: 500 },
    );
  } finally {
    clearTimeout(slowRequestLogTimeout);
  }
});

async function getSetupProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      rules: { select: { id: true }, take: 1 },
      newsletters: {
        where: { status: { not: null } },
        take: 1,
      },
      calendarConnections: { select: { id: true }, take: 1 },
      members: {
        take: 1,
        select: {
          role: true,
          organizationId: true,
          organization: {
            select: {
              _count: {
                select: {
                  members: true,
                  invitations: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!emailAccount) {
    throw new SafeError("Email account not found");
  }

  const membership = emailAccount.members[0];
  const isOwner = membership?.role === "owner";
  const hasNoOrg = !membership;
  const hasTeamMembers = (membership?.organization?._count.members ?? 0) > 1;
  const hasPendingInvitations =
    (membership?.organization?._count.invitations ?? 0) > 0;
  const teamInviteCompleted = hasTeamMembers || hasPendingInvitations;

  const showTeamInviteStep = hasNoOrg || isOwner;

  const steps = {
    aiAssistant: emailAccount.rules.length > 0,
    bulkUnsubscribe: emailAccount.newsletters.length > 0,
    calendarConnected: emailAccount.calendarConnections.length > 0,
  };

  const baseCompleted = Object.values(steps).filter(Boolean).length;
  const baseTotal = Object.keys(steps).length;

  const completed = showTeamInviteStep
    ? baseCompleted + (teamInviteCompleted ? 1 : 0)
    : baseCompleted;
  const total = showTeamInviteStep ? baseTotal + 1 : baseTotal;

  return {
    steps,
    completed,
    total,
    isComplete: completed === total,
    teamInvite: showTeamInviteStep
      ? {
          completed: teamInviteCompleted,
          organizationId: membership?.organizationId,
        }
      : null,
  };
}
