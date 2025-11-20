import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { cleanupOrphanedAccount } from "@/utils/user/orphaned-account";

interface AccountLinkingParams {
  existingAccountId: string | null;
  hasEmailAccount: boolean;
  existingUserId: string | null;
  targetUserId: string;
  provider: "google" | "microsoft";
  providerEmail: string;
  logger: Logger;
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
> {
  const redirectUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);

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
      select: { userId: true, email: true },
    });

    if (existingEmailAccount && existingEmailAccount.userId !== targetUserId) {
      logger.warn(
        `Create Failed: ${provider} account with this email already exists for a different user.`,
        {
          email: providerEmail,
          existingUserId: existingEmailAccount.userId,
          targetUserId,
        },
      );
      redirectUrl.searchParams.set("error", "account_already_exists_use_merge");
      return {
        type: "redirect",
        response: NextResponse.redirect(redirectUrl),
      };
    }

    return { type: "continue_create" };
  }

  if (existingUserId === targetUserId) {
    logger.warn(`${provider} account is already linked to the correct user.`, {
      email: providerEmail,
      targetUserId,
    });
    redirectUrl.searchParams.set("error", "already_linked_to_self");
    return {
      type: "redirect",
      response: NextResponse.redirect(redirectUrl),
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
