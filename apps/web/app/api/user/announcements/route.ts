import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { getActiveAnnouncements } from "@/utils/announcements";

export type GetAnnouncementsResponse = Awaited<
  ReturnType<typeof getAnnouncements>
>;

export const GET = withAuth("user/announcements", async (request) => {
  const { userId } = request.auth;
  const { searchParams } = new URL(request.url);
  const emailAccountId = searchParams.get("emailAccountId") ?? undefined;
  const result = await getAnnouncements({ userId, emailAccountId });
  return NextResponse.json(result);
});

async function getAnnouncements({
  userId,
  emailAccountId,
}: {
  userId: string;
  emailAccountId?: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      announcementDismissedAt: true,
      emailAccounts: {
        where: emailAccountId ? { id: emailAccountId } : undefined,
        select: {
          id: true,
          followUpAwaitingReplyDays: true,
          followUpNeedsReplyDays: true,
          autoCategorizeSenders: true,
        },
      },
    },
  });

  const dismissedAt = user?.announcementDismissedAt;
  const emailAccounts = user?.emailAccounts ?? [];

  const allAnnouncements = getActiveAnnouncements();

  const hasNewAnnouncements = dismissedAt
    ? allAnnouncements.some(
        (a) => new Date(a.publishedAt) > new Date(dismissedAt),
      )
    : allAnnouncements.length > 0;

  // If a specific emailAccountId was requested, return isEnabled for that account.
  // Otherwise, isEnabled defaults to the first account's state (for backwards compatibility)
  // and isEnabledByAccount provides per-account states for all accounts.
  const targetAccount = emailAccountId ? emailAccounts[0] : emailAccounts[0]; // Default to first account when no specific account requested

  const announcements = allAnnouncements.map((a) => ({
    ...a,
    isEnabled: getFeatureEnabledState(a.id, targetAccount),
    // Include per-account states only when no specific account was requested
    ...(emailAccountId
      ? {}
      : {
          isEnabledByAccount: Object.fromEntries(
            emailAccounts.map((account) => [
              account.id,
              getFeatureEnabledState(a.id, account),
            ]),
          ),
        }),
  }));

  return {
    announcements,
    hasNewAnnouncements,
  };
}

function getFeatureEnabledState(
  announcementId: string,
  emailAccount:
    | {
        followUpAwaitingReplyDays: number | null;
        followUpNeedsReplyDays: number | null;
        autoCategorizeSenders: boolean;
      }
    | undefined,
): boolean {
  if (!emailAccount) return false;

  switch (announcementId) {
    case "follow-up-tracking-2025-01":
      return (
        emailAccount.followUpAwaitingReplyDays !== null ||
        emailAccount.followUpNeedsReplyDays !== null
      );
    case "smart-categories-2025-01":
      return emailAccount.autoCategorizeSenders;
    default:
      return false;
  }
}
