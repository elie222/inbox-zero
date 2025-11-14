import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { withError } from "@/utils/middleware";
import { validateOAuthCallback } from "@/utils/oauth/callback-validation";
import { handleAccountLinking } from "@/utils/oauth/account-linking";
import { mergeAccount } from "@/utils/user/merge-account";

const logger = createScopedLogger("google/linking/callback");

export const GET = withError(async (request) => {
  const searchParams = request.nextUrl.searchParams;
  const storedState = request.cookies.get(
    GOOGLE_LINKING_STATE_COOKIE_NAME,
  )?.value;

  const validation = validateOAuthCallback({
    code: searchParams.get("code"),
    receivedState: searchParams.get("state"),
    storedState,
    stateCookieName: GOOGLE_LINKING_STATE_COOKIE_NAME,
    logger,
  });

  if (!validation.success) {
    return validation.response;
  }

  const { targetUserId, action, code } = validation;
  const redirectUrl = new URL("/accounts", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);

  const googleAuth = getLinkingOAuth2Client();

  try {
    const { tokens } = await googleAuth.getToken(code);
    const { id_token } = tokens;

    if (!id_token) {
      throw new Error("Missing id_token from Google response");
    }

    let payload: {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    };
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

    const linkingResult = await handleAccountLinking({
      existingAccountId: existingAccount?.id || null,
      hasEmailAccount: !!existingAccount?.emailAccount,
      existingUserId: existingAccount?.userId || null,
      targetUserId,
      action,
      provider: "google",
      providerEmail,
      logger,
    });

    if (linkingResult.type === "redirect") {
      return linkingResult.response;
    }

    if (linkingResult.type === "continue_create") {
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
          expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
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

    logger.info("Merging Google account (user confirmed).", {
      email: providerEmail,
      providerAccountId,
      existingUserId: linkingResult.sourceUserId,
      targetUserId,
    });

    const mergeType = await mergeAccount({
      sourceAccountId: linkingResult.sourceAccountId,
      sourceUserId: linkingResult.sourceUserId,
      targetUserId,
      email: providerEmail,
      name: existingAccount?.user.name || null,
      logger,
    });

    const successMessage =
      mergeType === "full_merge"
        ? "account_merged"
        : "account_created_and_linked";

    logger.info("Account re-assigned to user. Original user was different.", {
      providerAccountId,
      targetUserId,
      originalUserId: linkingResult.sourceUserId,
      mergeType,
    });

    redirectUrl.searchParams.set("success", successMessage);
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
