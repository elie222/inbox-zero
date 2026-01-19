"use server";

import prisma from "@/utils/prisma";
import { actionClientUser } from "@/utils/actions/safe-action";
import { dismissAnnouncementBody } from "@/utils/actions/announcements.validation";

export const dismissAnnouncementAction = actionClientUser
  .metadata({ name: "dismissAnnouncement" })
  .inputSchema(dismissAnnouncementBody)
  .action(async ({ ctx: { userId }, parsedInput: { announcementId } }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dismissedAnnouncements: true },
    });

    const currentDismissed = user?.dismissedAnnouncements ?? [];

    // Avoid duplicates
    if (!currentDismissed.includes(announcementId)) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          dismissedAnnouncements: [...currentDismissed, announcementId],
        },
      });
    }

    return { success: true };
  });
