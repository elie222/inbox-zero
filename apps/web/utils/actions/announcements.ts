"use server";

import { revalidatePath } from "next/cache";
import { announcementDismissedBody } from "@/utils/actions/announcements.validation";
import { actionClientUser } from "@/utils/actions/safe-action";
import prisma from "@/utils/prisma";

export const dismissAnnouncementModalAction = actionClientUser
  .metadata({ name: "dismissAnnouncementModal" })
  .schema(announcementDismissedBody)
  .action(async ({ ctx: { userId }, parsedInput: { publishedAt } }) => {
    const dismissedAt = new Date(new Date(publishedAt).getTime() + 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        announcementDismissedAt: dismissedAt,
      },
    });

    revalidatePath("/");

    return { success: true };
  });
