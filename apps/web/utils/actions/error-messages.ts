"use server";

import { revalidatePath } from "next/cache";
import { clearUserErrorMessages } from "@/utils/error-messages";
import { actionClient } from "@/utils/actions/safe-action";

export const clearUserErrorMessagesAction = actionClient
  .metadata({ name: "clearUserErrorMessages" })
  .action(async ({ ctx: { userId } }) => {
    await clearUserErrorMessages({ userId });
    revalidatePath("/(app)", "layout");
  });
