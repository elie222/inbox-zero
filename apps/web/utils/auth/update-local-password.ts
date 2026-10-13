import { APIError } from "better-auth";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

export async function updateLocalPassword({
  userId,
  requestHeaders,
  currentPassword,
  newPassword,
}: {
  userId: string;
  requestHeaders: Headers;
  currentPassword?: string;
  newPassword: string;
}) {
  if (!env.LOCAL_PASSWORD_AUTH_ENABLED)
    throw new SafeError("Local password sign-in is not enabled.");
  const credential = await prisma.account.findFirst({
    where: { userId, provider: "credential" },
    select: { password: true },
  });
  if (credential?.password && !currentPassword)
    throw new SafeError("Enter your current password.");
  try {
    if (credential?.password) {
      await betterAuthConfig.api.changePassword({
        headers: requestHeaders,
        body: {
          currentPassword: currentPassword!,
          newPassword,
          revokeOtherSessions: false,
        },
      });
    } else {
      await betterAuthConfig.api.setPassword({
        headers: requestHeaders,
        body: { newPassword },
      });
    }
  } catch (error) {
    if (error instanceof APIError) {
      if (error.body?.code === "INVALID_PASSWORD")
        throw new SafeError("Your current password is incorrect.");
      throw new SafeError(
        "Could not update your password. Sign in again and retry.",
      );
    }
    throw error;
  }
}
