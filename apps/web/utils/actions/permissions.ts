"use server";

import { z } from "zod";
import { isAdmin } from "@/utils/admin";
import { getGmailAccessToken } from "@/utils/gmail/client";
import { handleGmailPermissionsCheck } from "@/utils/gmail/permissions";
import { createScopedLogger } from "@/utils/logger";
import { actionClient } from "@/utils/actions/safe-action";
import { getTokens } from "@/utils/account";

const logger = createScopedLogger("actions/permissions");

export const checkPermissionsAction = actionClient
  .metadata({ name: "checkPermissions" })
  .action(async ({ ctx: { email } }) => {
    try {
      const tokens = await getTokens({ email });
      const token = await getGmailAccessToken(tokens);
      if (!token.token) return { error: "No Gmail access token" };

      const { hasAllPermissions, error } = await handleGmailPermissionsCheck({
        accessToken: token.token,
        email,
      });
      if (error) return { error };

      if (!hasAllPermissions) return { hasAllPermissions: false };

      if (!tokens?.refreshToken)
        return { hasRefreshToken: false, hasAllPermissions };

      return { hasRefreshToken: true, hasAllPermissions };
    } catch (error) {
      logger.error("Failed to check permissions", {
        email,
        error,
      });
      return { error: "Failed to check permissions" };
    }
  });

export const adminCheckPermissionsAction = actionClient
  .metadata({ name: "adminCheckPermissions" })
  .schema(z.object({ email: z.string().email() }))
  .action(async ({ ctx: { userId }, parsedInput: { email } }) => {
    if (!isAdmin(userId)) return { error: "Not admin" };

    try {
      const tokens = await getTokens({ email });
      if (!tokens?.accessToken) return { error: "No access token" };
      const token = await getGmailAccessToken(tokens);
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
  });
