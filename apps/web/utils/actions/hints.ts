"use server";

import { revalidatePath } from "next/cache";
import { dismissHintBody } from "@/utils/actions/hints.validation";
import { actionClientUser } from "@/utils/actions/safe-action";
import prisma from "@/utils/prisma";

export const dismissHintAction = actionClientUser
  .metadata({ name: "dismissHint" })
  .schema(dismissHintBody)
  .action(async ({ ctx: { userId }, parsedInput: { hintId } }) => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        dismissedHints: { push: hintId },
      },
    });

    revalidatePath("/");

    return { success: true };
  });
