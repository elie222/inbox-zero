import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { withError } from "@/utils/middleware";
import { parseOAuthState } from "@/utils/oauth/state";
import { cleanupOrphanedAccount } from "@/utils/user/orphaned-account";
import { mergeAccount } from "@/utils/user/merge-account";

const logger = createScopedLogger("google/linking/callback");

export const GET = withError(async (request) => {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(
    GOOGLE_LINKING_STATE_COOKIE_NAME,
  )?.value;

  const redirectUrl = new URL("/accounts", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during Google linking callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  let decodedState: {
    userId: string;
    action: "auto" | "merge_confirmed";
    nonce: string;
  };
  try {
    decodedState = parseOAuthState(storedState);
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);

  const { userId: targetUserId, action } = decodedState;

  if (!code) {
    logger.warn("Missing code in Google linking callback");
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  const googleAuth = getLinkingOAuth2Client();

  try {
    const { tokens } = await googleAuth.getToken(code);
    const { id_token } = tokens;

    if (!id_token) {
      throw new Error("Missing id_token from Google response");
    }

    let payload: any;
    try {
      const ticket = await googleAuth.verifyIdToken({
        idToken: id_token,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const verifiedPayload = ticket.getPayload();
      if (!verifiedPayload) {
        throw new Error("Could not get payload from verified ID token ticket.");
      }
      payload = verifiedPayload;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error("ID token verification failed using googleAuth:", {
        error: err,
      });
      throw new Error(`ID token verification failed: ${message}`);
    }

    const providerAccountId = payload.sub;
    const providerEmail = payload.email;

    if (!providerAccountId || !providerEmail) {
      throw new Error(
        "ID token missing required subject (sub) or email claim.",
      );
    }

    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: { provider: "google", providerAccountId },
      },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true, email: true } },
        emailAccount: true,
      },
    });

    if (existingAccount && !existingAccount.emailAccount) {
      logger.warn("Found orphaned Account, cleaning up", {
        orphanedAccountId: existingAccount.id,
        orphanedUserId: existingAccount.userId,
        email: providerEmail,
        targetUserId,
      });

      await cleanupOrphanedAccount(existingAccount.id);
    }

    const hasValidAccount = existingAccount?.emailAccount;

    if (!hasValidAccount) {
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
            "Create Failed: Google account with this email already exists for a different user.",
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
          return NextResponse.redirect(redirectUrl, {
            headers: response.headers,
          });
        }

        logger.info("Creating new Google account and linking to current user", {
          email: providerEmail,
          targetUserId,
        });

        const newAccount = await prisma.account.create({
          data: {
            userId: targetUserId,
            type: "oidc",
            provider: "google",
            providerAccountId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expiry_date
              ? new Date(tokens.expiry_date)
              : null,
            scope: tokens.scope,
            token_type: tokens.token_type,
            id_token: tokens.id_token,
          },
        });

        await prisma.emailAccount.create({
          data: {
            email: providerEmail,
            userId: targetUserId,
            accountId: newAccount.id,
            name: payload.name || providerEmail,
            image: payload.picture,
          },
        });

        logger.info("Successfully created and linked new Google account", {
          email: providerEmail,
          targetUserId,
          accountId: newAccount.id,
        });
        redirectUrl.searchParams.set("success", "account_created_and_linked");
        return NextResponse.redirect(redirectUrl, {
          headers: response.headers,
        });
      }
    }

    if (existingAccount?.userId === targetUserId) {
      logger.warn("Google account is already linked to the correct user.", {
        email: providerEmail,
        providerAccountId,
        userId: targetUserId,
      });
      redirectUrl.searchParams.set("error", "already_linked_to_self");
      return NextResponse.redirect(redirectUrl, {
        headers: response.headers,
      });
    }

    if (!existingAccount) {
      throw new Error("Unexpected state: existingAccount should exist");
    }

    if (action === "auto") {
      logger.info(
        "Account exists for different user, requesting merge confirmation",
        {
          email: providerEmail,
          existingUserId: existingAccount.userId,
          targetUserId,
        },
      );

      redirectUrl.searchParams.set("confirm_merge", "true");
      redirectUrl.searchParams.set("provider", "google");
      redirectUrl.searchParams.set("email", providerEmail);
      return NextResponse.redirect(redirectUrl, {
        headers: response.headers,
      });
    }

    logger.info("Merging Google account (user confirmed).", {
      email: providerEmail,
      providerAccountId,
      existingUserId: existingAccount.userId,
      targetUserId,
    });

    const mergeType = await mergeAccount({
      sourceAccountId: existingAccount.id,
      sourceUserId: existingAccount.userId,
      targetUserId,
      email: providerEmail,
      name: existingAccount.user.name,
      logger,
    });

    const successMessage =
      mergeType === "full_merge"
        ? "account_merged"
        : "account_created_and_linked";
    redirectUrl.searchParams.set("success", successMessage);

    logger.info("Account re-assigned to user. Original user was different.", {
      providerAccountId,
      targetUserId,
      originalUserId: existingAccount.userId,
    });
    redirectUrl.searchParams.set("success", "account_merged");
    return NextResponse.redirect(redirectUrl, {
      headers: response.headers,
    });
  } catch (error) {
    logger.error("Error in Google linking callback:", { error });
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    let errorCode = "link_failed";

    if (errorMessage.includes("ID token verification failed")) {
      errorCode = "invalid_id_token";
    } else if (errorMessage.includes("Missing id_token")) {
      errorCode = "missing_id_token";
    } else if (errorMessage.includes("ID token missing required")) {
      errorCode = "incomplete_id_token";
    } else if (errorMessage.includes("Missing access_token")) {
      errorCode = "token_exchange_failed";
    }

    redirectUrl.searchParams.set("error", errorCode);
    redirectUrl.searchParams.set("error_description", errorMessage);
    response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
});
