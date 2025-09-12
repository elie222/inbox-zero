"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("actions/calendar");

// Check calendar connection status
export const checkCalendarStatusAction = actionClient
  .metadata({ name: "checkCalendarStatus" })
  .action(async ({ ctx: { emailAccountId } }) => {
    logger.info("Checking calendar connection status", { emailAccountId });

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      include: { account: true },
    });

    if (!emailAccount?.account) {
      return {
        isConnected: false,
        provider: null,
        hasCalendarScopes: false,
      };
    }

    // Check if the account has calendar scopes
    // Look for specific calendar-related scopes in the account's scope string
    const scope = emailAccount.account.scope || "";
    const hasCalendarScopes =
      scope.includes("calendar.events") ||
      scope.includes("calendar.readonly") ||
      scope.includes("calendar");

    logger.info("Calendar status check", {
      emailAccountId,
      scope,
      hasCalendarScopes,
      provider: emailAccount.account.provider,
    });

    return {
      isConnected: true,
      provider: emailAccount.account.provider,
      hasCalendarScopes,
      accountId: emailAccount.account.id,
    };
  });
