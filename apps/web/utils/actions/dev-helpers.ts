"use server";

import { headers } from "next/headers";
import prisma from "@/utils/prisma";
import { deleteUser } from "@/utils/user/delete";
import { actionClientUser } from "@/utils/actions/safe-action";
import { betterAuthConfig } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";

export const devDeleteAccountAction = actionClientUser
  .metadata({ name: "devDeleteAccount" })
  .action(async ({ ctx: { userId, userEmail } }) => {
    // Only allow in development or for admin users
    if (
      process.env.NODE_ENV !== "development" &&
      !isAdmin({ email: userEmail })
    ) {
      throw new Error(
        "This action is only available in development or for admins",
      );
    }

    // Delete the user (this handles all cleanup including premium/Stripe)
    await deleteUser({ userId });

    // Sign out the user
    try {
      await betterAuthConfig.api.signOut({
        headers: await headers(),
      });
    } catch (error) {
      // Ignore signout errors since user is deleted
    }

    return { success: true };
  });
