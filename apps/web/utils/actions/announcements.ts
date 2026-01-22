"use server";

import { z } from "zod";
import prisma from "@/utils/prisma";
import { actionClientUser } from "@/utils/actions/safe-action";

export const dismissAnnouncementModalAction = actionClientUser
  .metadata({ name: "dismissAnnouncementModal" })
  .schema(
    z.object({
      publishedAt: z.string().datetime(),
    }),
  )
  .action(async ({ ctx: { userId }, parsedInput: { publishedAt } }) => {
    const dismissedAt = new Date(new Date(publishedAt).getTime() + 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        announcementDismissedAt: dismissedAt,
      },
    });

    return { success: true };
  });
