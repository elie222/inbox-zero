import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { cleanupOrphanedAccount } from "@/utils/user/orphaned-account";

interface AccountLinkingParams {
  existingAccountId: string | null;
  hasEmailAccount: boolean;
  existingUserId: string | null;
  targetUserId: string;
  action: "auto" | "merge_confirmed";
  provider: "google" | "microsoft";
  providerEmail: string;
  baseUrl: string;
  logger: Logger;
}

export async function handleAccountLinking({
  existingAccountId,
  hasEmailAccount,
  existingUserId,
  targetUserId,
  action,
  provider,
  providerEmail,
  baseUrl,
  logger,
}: AccountLinkingParams): Promise<
  | { type: "continue_create" }
  | { type: "redirect"; response: NextResponse }
  | { type: "merge"; sourceAccountId: string; sourceUserId: string }
> {
  const redirectUrl = new URL("/accounts", baseUrl);

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
    if (action === "auto") {
      const existingEmailAccount = await prisma.emailAccount.findUnique({
        where: { email: providerEmail.trim().toLowerCase() },
        select: { userId: true, email: true },
      });

      if (
        existingEmailAccount &&
        existingEmailAccount.userId !== targetUserId
      ) {
        logger.warn(
          `Create Failed: ${provider} account with this email already exists for a different user.`,
          {
            email: providerEmail,
            existingUserId: existingEmailAccount.userId,
            targetUserId,
          },
        );
        redirectUrl.searchParams.set(
          "error",
          "account_already_exists_use_merge",
        );
        return {
          type: "redirect",
          response: NextResponse.redirect(redirectUrl),
        };
      }
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

  if (action === "auto") {
    logger.info(
      "Account exists for different user, requesting merge confirmation",
      {
        email: providerEmail,
        existingUserId,
        targetUserId,
      },
    );

    redirectUrl.searchParams.set("confirm_merge", "true");
    redirectUrl.searchParams.set("provider", provider);
    redirectUrl.searchParams.set("email", providerEmail);
    return {
      type: "redirect",
      response: NextResponse.redirect(redirectUrl),
    };
  }

  if (!existingAccountId || !existingUserId) {
    throw new Error("Unexpected state: existingAccount should exist");
  }

  return {
    type: "merge",
    sourceAccountId: existingAccountId,
    sourceUserId: existingUserId,
  };
}
