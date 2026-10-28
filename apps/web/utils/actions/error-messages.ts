"use server";

import { clearUserErrorMessages } from "@/utils/error-messages";
import { actionClientUser } from "@/utils/actions/safe-action";

export const clearUserErrorMessagesAction = actionClientUser
  .metadata({ name: "clearUserErrorMessages" })
  .action(async ({ ctx: { userId, logger } }) => {
    await clearUserErrorMessages({ userId, logger });
  });
