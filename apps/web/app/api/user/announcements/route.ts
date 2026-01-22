import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { getActiveAnnouncements } from "@/utils/announcements";

export type GetAnnouncementsResponse = Awaited<
  ReturnType<typeof getAnnouncements>
>;

export const GET = withAuth("user/announcements", async (request) => {
  const { userId } = request.auth;
  const result = await getAnnouncements({ userId });
  return NextResponse.json(result);
});

async function getAnnouncements({ userId }: { userId: string }) {
  // Fetch user's dismissal timestamp and their first email account for feature states
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      announcementDismissedAt: true,
      emailAccounts: {
        select: {
          id: true,
          followUpAwaitingReplyDays: true,
          followUpNeedsReplyDays: true,
          autoCategorizeSenders: true,
        },
        take: 1,
      },
    },
  });

  const dismissedAt = user?.announcementDismissedAt;
  const emailAccount = user?.emailAccounts[0];

  // Get all active announcements (less than 6 months old)
  const allAnnouncements = getActiveAnnouncements();

  // Check if there are any announcements newer than the dismissal date
  const hasNewAnnouncements = dismissedAt
    ? allAnnouncements.some(
        (a) => new Date(a.publishedAt) > new Date(dismissedAt),
      )
    : allAnnouncements.length > 0;

  // Map announcements with isEnabled flag based on actual feature state
  const announcements = allAnnouncements.map((a) => ({
    ...a,
    isEnabled: getFeatureEnabledState(a.id, emailAccount),
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
