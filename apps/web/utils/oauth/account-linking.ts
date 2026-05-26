import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { createAccountLinkingRedirect } from "@/utils/oauth/account-linking-redirect";
import { cleanupOrphanedAccount } from "@/utils/user/orphaned-account";

interface AccountLinkingParams {
  existingAccountId: string | null;
  existingUserId: string | null;
  hasEmailAccount: boolean;
  logger: Logger;
  provider: "google" | "microsoft";
  providerEmail: string;
  targetUserId: string;
}

export async function handleAccountLinking({
  existingAccountId,
  hasEmailAccount,
  existingUserId,
  targetUserId,
  provider,
  providerEmail,
  logger,
}: AccountLinkingParams): Promise<
  | { type: "continue_create" }
  | { type: "redirect"; response: NextResponse }
  | { type: "merge"; sourceAccountId: string; sourceUserId: string }
  | { type: "update_tokens"; existingAccountId: string }
> {
  const hasActiveTargetUser = await hasActiveAccountLinkingUser({
    targetUserId,
    logger,
  });

  if (!hasActiveTargetUser) {
    return {
      type: "redirect",
      response: NextResponse.redirect(
        new URL("/logout", env.NEXT_PUBLIC_BASE_URL),
      ),
    };
  }

  if (existingAccountId && !hasEmailAccount) {
    logger.warn("Found orphaned Account, cleaning up", {
      orphanedAccountId: existingAccountId,
      orphanedUserId: existingUserId,
      email: providerEmail,
      targetUserId,
    });

    await cleanupOrphanedAccount(existingAccountId, logger);
    return { type: "continue_create" };
  }

  if (!existingAccountId || !hasEmailAccount) {
    const existingEmailAccount = await prisma.emailAccount.findUnique({
      where: { email: providerEmail.trim().toLowerCase() },
      select: { userId: true },
    });

    if (existingEmailAccount && existingEmailAccount.userId !== targetUserId) {
      logger.warn(
        "Create failed: account with this email already exists for a different user",
        {
          provider,
          email: providerEmail,
          existingUserId: existingEmailAccount.userId,
          targetUserId,
        },
      );

      return {
        type: "redirect",
        response: createAccountLinkingRedirect({
          query: { error: "account_already_exists" },
        }),
      };
    }

    return { type: "continue_create" };
  }

  if (existingUserId === targetUserId) {
    logger.info(
      "Account is already linked to the correct user. Updating tokens.",
      {
        provider,
        email: providerEmail,
        targetUserId,
        existingAccountId,
      },
    );
    return {
      type: "update_tokens",
      existingAccountId,
    };
  }

  if (!existingAccountId || !existingUserId) {
    throw new Error("Unexpected state: existingAccount should exist");
  }

  logger.info("Account exists for different user, merging accounts", {
    email: providerEmail,
    existingUserId,
    targetUserId,
  });

  return {
    type: "merge",
    sourceAccountId: existingAccountId,
    sourceUserId: existingUserId,
  };
}

export async function hasActiveAccountLinkingUser({
  targetUserId,
  logger,
}: {
  targetUserId: string;
  logger: Logger;
}) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });

  if (user) return true;

  logger.warn("Account linking attempted with deleted user in session", {
    targetUserId,
  });

  return false;
}
