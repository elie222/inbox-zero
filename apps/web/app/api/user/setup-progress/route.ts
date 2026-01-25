import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetSetupProgressResponse = Awaited<
  ReturnType<typeof getSetupProgress>
>;

export const GET = withEmailAccount("user/setup-progress", async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getSetupProgress({ emailAccountId });
  return NextResponse.json(result);
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
    throw new Error("Email account not found");
  }

  const steps = {
    aiAssistant: emailAccount.rules.length > 0,
    bulkUnsubscribe: emailAccount.newsletters.length > 0,
    calendarConnected: emailAccount.calendarConnections.length > 0,
  };

  const completed = Object.values(steps).filter(Boolean).length;
  const total = Object.keys(steps).length;

  const membership = emailAccount.members[0];
  const isOwner = membership?.role === "owner";
  const hasTeamMembers = (membership?.organization?._count.members ?? 0) > 1;
  const hasPendingInvitations =
    (membership?.organization?._count.invitations ?? 0) > 0;

  return {
    steps,
    completed,
    total,
    isComplete: completed === total,
    teamInvite: isOwner
      ? {
          isOwner: true,
          completed: hasTeamMembers || hasPendingInvitations,
          organizationId: membership?.organizationId,
        }
      : null,
  };
}
