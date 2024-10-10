"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { ServerActionResponse } from "@/utils/error";
import { clearUserErrorMessages } from "@/utils/error-messages";

export async function clearUserErrorMessagesAction(): Promise<ServerActionResponse> {
  const session = await auth();
  if (!session?.user) return { error: "Not logged in" };
  await clearUserErrorMessages(session.user.id);
  revalidatePath("/(app)", "layout");
}
