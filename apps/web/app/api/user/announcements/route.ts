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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      announcementDismissedAt: true,
    },
  });

  const dismissedAt = user?.announcementDismissedAt;
  const announcements = getActiveAnnouncements();

  const hasNewAnnouncements = dismissedAt
    ? announcements.some((a) => new Date(a.publishedAt) > new Date(dismissedAt))
    : announcements.length > 0;

  return {
    announcements,
    hasNewAnnouncements,
  };
}
