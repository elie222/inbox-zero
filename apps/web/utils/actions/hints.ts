"use server";

import { dismissHintBody } from "@/utils/actions/hints.validation";
import { actionClientUser } from "@/utils/actions/safe-action";
import prisma from "@/utils/prisma";

export const dismissHintAction = actionClientUser
  .metadata({ name: "dismissHint" })
  .schema(dismissHintBody)
  .action(async ({ ctx: { userId }, parsedInput: { hintId } }) => {
    await prisma.user.updateMany({
      where: {
        id: userId,
        NOT: { dismissedHints: { has: hintId } },
      },
      data: {
        dismissedHints: { push: hintId },
      },
    });

    return { success: true };
  });
