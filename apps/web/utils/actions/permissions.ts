"use server";

import { z } from "zod";
import { handleGmailPermissionsCheck } from "@/utils/gmail/permissions";
import { actionClient, adminActionClient } from "@/utils/actions/safe-action";
import { getGmailAndAccessTokenForEmail } from "@/utils/account";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { isGoogleProvider } from "@/utils/email/provider-types";

export const checkPermissionsAction = actionClient
  .metadata({ name: "checkPermissions" })
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    if (!isGoogleProvider(provider)) {
      // TODO: add Outlook handling
      return { hasAllPermissions: true, hasRefreshToken: true };
    }

    try {
      const { accessToken, tokens } = await getGmailAndAccessTokenForEmail({
        emailAccountId,
      });

      if (!tokens.refreshToken || !accessToken)
        return { hasRefreshToken: true, hasAllPermissions: false };

      const { hasAllPermissions, error } = await handleGmailPermissionsCheck({
        accessToken,
        refreshToken: tokens.refreshToken,
        emailAccountId,
      });

      if (error) throw new SafeError(error);

      if (!hasAllPermissions) return { hasAllPermissions: false };

      if (!tokens.refreshToken)
        return { hasRefreshToken: false, hasAllPermissions };

      return { hasRefreshToken: true, hasAllPermissions };
    } catch (error) {
      logger.error("Failed to check permissions", { error });
      // throw new SafeError("Failed to check permissions");
      return { hasRefreshToken: false, hasAllPermissions: false };
    }
  });

export const adminCheckPermissionsAction = adminActionClient
  .metadata({ name: "adminCheckPermissions" })
  .schema(z.object({ email: z.string().email() }))
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    try {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email },
        select: { id: true, account: { select: { provider: true } } },
      });
      if (!emailAccount) throw new SafeError("Email account not found");
      const emailAccountId = emailAccount.id;

      if (!isGoogleProvider(emailAccount.account.provider)) {
        throw new SafeError("Not supported for non-Google providers");
      }

      const { accessToken, tokens } = await getGmailAndAccessTokenForEmail({
        emailAccountId,
      });
      if (!accessToken) throw new SafeError("No Gmail access token");

      const { hasAllPermissions, error } = await handleGmailPermissionsCheck({
        accessToken,
        refreshToken: tokens.refreshToken,
        emailAccountId,
      });
      if (error) throw new SafeError(error);
      return { hasAllPermissions };
    } catch (error) {
      logger.error("Admin failed to check permissions", { error });
      throw new SafeError("Failed to check permissions");
    }
  });
