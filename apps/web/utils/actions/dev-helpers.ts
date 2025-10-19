"use server";

import { headers } from "next/headers";
import prisma from "@/utils/prisma";
import { deleteUser } from "@/utils/user/delete";
import { actionClientUser } from "@/utils/actions/safe-action";
import { betterAuthConfig } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";

export const devResetOnboardingAction = actionClientUser
  .metadata({ name: "devResetOnboarding" })
  .action(async ({ ctx: { userId, userEmail } }) => {
    // Only allow in local development environment or for admin users
    const isLocalDev =
      process.env.NODE_ENV === "development" &&
      (process.env.DATABASE_URL?.includes("localhost") ||
        process.env.DATABASE_URL?.includes("inbox_zero_local") ||
        process.env.NEXT_PUBLIC_BASE_URL?.includes("localhost"));

    if (!isLocalDev && !isAdmin({ email: userEmail })) {
      throw new Error(
        "This action is only available in local development or for admins",
      );
    }

    // Reset all onboarding-related fields to trigger the full flow again
    await prisma.user.update({
      where: { id: userId },
      data: {
        completedOnboardingAt: null,
        onboardingAnswers: null,
        surveyFeatures: [],
        surveyRole: null,
        surveyGoal: null,
        surveyCompanySize: null,
        surveySource: null,
        surveyImprovements: null,
      },
    });

    return { success: true };
  });

export const devDeleteAccountAction = actionClientUser
  .metadata({ name: "devDeleteAccount" })
  .action(async ({ ctx: { userId, userEmail } }) => {
    // Only allow in local development environment or for admin users
    const isLocalDev =
      process.env.NODE_ENV === "development" &&
      (process.env.DATABASE_URL?.includes("localhost") ||
        process.env.DATABASE_URL?.includes("inbox_zero_local") ||
        process.env.NEXT_PUBLIC_BASE_URL?.includes("localhost"));

    if (!isLocalDev && !isAdmin({ email: userEmail })) {
      throw new Error(
        "This action is only available in local development or for admins",
      );
    }

    // Delete the user (this handles all cleanup including premium/Stripe)
    await deleteUser({ userId });

    // Sign out the user
    try {
      await betterAuthConfig.api.signOut({
        headers: await headers(),
      });
    } catch (_error) {
      // Ignore signout errors since user is deleted
    }

    return { success: true };
  });
