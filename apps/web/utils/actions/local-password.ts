"use server";

import { headers } from "next/headers";
import { actionClientUser } from "@/utils/actions/safe-action";
import { updateLocalPasswordBody } from "@/utils/actions/local-password.validation";
import { updateLocalPassword } from "@/utils/auth/update-local-password";
import { SafeError } from "@/utils/error";

export const updateLocalPasswordAction = actionClientUser
  .metadata({ name: "updateLocalPassword" })
  .inputSchema(updateLocalPasswordBody)
  .action(async ({ ctx: { userId, session }, parsedInput }) => {
    if (session.session.emailOtp)
      throw new SafeError(
        "Sign in with your password or connected provider to change your password.",
      );
    await updateLocalPassword({
      userId,
      requestHeaders: await headers(),
      currentPassword: parsedInput.currentPassword,
      newPassword: parsedInput.newPassword,
    });
    return { success: true };
  });
