"use server";

import { z } from "zod";
import { handleGmailPermissionsCheck } from "@/utils/gmail/permissions";
import { actionClient, adminActionClient } from "@/utils/actions/safe-action";
import {
  getGmailAndAccessTokenForEmail,
  getOutlookClientForEmail,
} from "@/utils/account";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { Logger } from "@/utils/logger";

export const checkPermissionsAction = actionClient
  .metadata({ name: "checkPermissions" })
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    if (isMicrosoftProvider(provider)) {
      return checkOutlookPermissions({ emailAccountId, logger });
    }

    if (!isGoogleProvider(provider)) {
      return { hasAllPermissions: true, hasRefreshToken: true };
    }

    try {
      const { accessToken, tokens } = await getGmailAndAccessTokenForEmail({
        emailAccountId,
        logger,
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
      return { hasRefreshToken: false, hasAllPermissions: false };
    }
  });

export const adminCheckPermissionsAction = adminActionClient
  .metadata({ name: "adminCheckPermissions" })
  .inputSchema(z.object({ email: z.string().email() }))
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    try {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email },
        select: { id: true, account: { select: { provider: true } } },
      });
      if (!emailAccount) throw new SafeError("Email account not found");
      const emailAccountId = emailAccount.id;

      if (isMicrosoftProvider(emailAccount.account.provider)) {
        return checkOutlookPermissions({ emailAccountId, logger });
      }

      if (!isGoogleProvider(emailAccount.account.provider)) {
        throw new SafeError("Unsupported provider");
      }

      const { accessToken, tokens } = await getGmailAndAccessTokenForEmail({
        emailAccountId,
        logger,
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

async function checkOutlookPermissions({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  try {
    const client = await getOutlookClientForEmail({ emailAccountId, logger });
    await client.getUserProfile();
    return { hasAllPermissions: true, hasRefreshToken: true };
  } catch (error) {
    logger.error("Outlook permissions check failed", { error });
    return { hasAllPermissions: false, hasRefreshToken: false };
  }
}
