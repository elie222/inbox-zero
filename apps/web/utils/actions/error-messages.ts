"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { clearUserErrorMessages } from "@/utils/error-messages";
import { withActionInstrumentation } from "@/utils/actions/middleware";

export const clearUserErrorMessagesAction = withActionInstrumentation(
  "clearUserErrorMessages",
  async () => {
    const session = await auth();
    if (!session?.user) return { error: "Not logged in" };
    await clearUserErrorMessages(session.user.id);
    revalidatePath("/(app)", "layout");
  },
);
