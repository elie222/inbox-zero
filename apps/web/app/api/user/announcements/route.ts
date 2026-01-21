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
    select: { dismissedAnnouncements: true },
  });

  const dismissedIds = new Set(user?.dismissedAnnouncements ?? []);
  const allAnnouncements = getActiveAnnouncements();

  // Return all announcements with isEnabled flag
  const announcements = allAnnouncements.map((a) => ({
    ...a,
    isEnabled: dismissedIds.has(a.id),
  }));

  return {
    announcements,
    totalCount: allAnnouncements.length,
    dismissedCount: dismissedIds.size,
  };
}
