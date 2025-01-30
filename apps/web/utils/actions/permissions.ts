"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { isAdmin } from "@/utils/admin";
import { getGmailAccessToken } from "@/utils/gmail/client";
import { handleGmailPermissionsCheck } from "@/utils/gmail/permissions";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("actions/permissions");

export const checkPermissionsAction = withActionInstrumentation(
  "checkPermissions",
  async () => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    try {
      const token = await getGmailAccessToken(session);
      if (!token.token) return { error: "No Gmail access token" };

      const { hasAllPermissions, error } = await handleGmailPermissionsCheck({
        accessToken: token.token,
        email: session.user.email,
      });
      if (error) return { error };

      if (!hasAllPermissions) return { hasAllPermissions: false };

      // Check for refresh token
      const user = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          provider: "google",
        },
        select: { refresh_token: true },
      });

      if (!user?.refresh_token)
        return { hasRefreshToken: false, hasAllPermissions };

      return { hasRefreshToken: true, hasAllPermissions };
    } catch (error) {
      logger.error("Failed to check permissions", {
        email: session?.user.email,
        error,
      });
      return { error: "Failed to check permissions" };
    }
  },
);

export const adminCheckPermissionsAction = withActionInstrumentation(
  "adminCheckPermissions",
  async ({ email }: { email: string }) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };
    if (!isAdmin(session.user.email)) return { error: "Not admin" };

    try {
      const account = await prisma.account.findFirst({
        where: { user: { email }, provider: "google" },
        select: { access_token: true, refresh_token: true },
      });
      if (!account) return { error: "No account found" };

      const token = await getGmailAccessToken({
        accessToken: account.access_token || undefined,
        refreshToken: account.refresh_token || undefined,
      });
      if (!token.token) return { error: "No Gmail access token" };

      const { hasAllPermissions, error } = await handleGmailPermissionsCheck({
        accessToken: token.token,
        email,
      });
      if (error) return { error };
      return { hasAllPermissions };
    } catch (error) {
      logger.error("Admin failed to check permissions", { email, error });
      return { error: "Failed to check permissions" };
    }
  },
);
