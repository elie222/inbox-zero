"use server";

import prisma from "@/utils/prisma";
import { actionClientUser } from "@/utils/actions/safe-action";

export const dismissAnnouncementModalAction = actionClientUser
  .metadata({ name: "dismissAnnouncementModal" })
  .action(async ({ ctx: { userId } }) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        announcementDismissedAt: new Date(),
      },
    });

    return { success: true };
  });
