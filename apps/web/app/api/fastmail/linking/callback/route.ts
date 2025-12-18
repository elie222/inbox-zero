import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import {
  getLinkingOAuth2Config,
  FASTMAIL_OAUTH_TOKEN_URL,
  getUserInfo,
} from "@/utils/fastmail/client";
import { FASTMAIL_LINKING_STATE_COOKIE_NAME } from "@/utils/fastmail/constants";
import { withError } from "@/utils/middleware";
import { validateOAuthCallback } from "@/utils/oauth/callback-validation";
import { handleAccountLinking } from "@/utils/oauth/account-linking";
import { mergeAccount } from "@/utils/user/merge-account";
import { handleOAuthCallbackError } from "@/utils/oauth/error-handler";
import {
  acquireOAuthCodeLock,
  getOAuthCodeResult,
  setOAuthCodeResult,
  clearOAuthCode,
} from "@/utils/redis/oauth-code";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { captureException } from "@/utils/error";

export const GET = withError("fastmail/linking/callback", async (request) => {
  const logger = request.logger;

  // Validate required environment variables before proceeding
  const config = getLinkingOAuth2Config();
  if (!config.clientId || !config.clientSecret) {
    logger.error(
      "Fastmail OAuth not configured: missing FASTMAIL_CLIENT_ID or FASTMAIL_CLIENT_SECRET",
    );
    const errorUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    errorUrl.searchParams.set("error", "fastmail_not_configured");
    return NextResponse.redirect(errorUrl);
  }

  const searchParams = request.nextUrl.searchParams;
  const storedState = request.cookies.get(
    FASTMAIL_LINKING_STATE_COOKIE_NAME,
  )?.value;

  const validation = validateOAuthCallback({
    code: searchParams.get("code"),
    receivedState: searchParams.get("state"),
    storedState,
    stateCookieName: FASTMAIL_LINKING_STATE_COOKIE_NAME,
    logger,
  });

  if (!validation.success) {
    return validation.response;
  }

  const { targetUserId, code } = validation;

  const cachedResult = await getOAuthCodeResult(code);
  if (cachedResult) {
    logger.info("OAuth code already processed, returning cached result", {
      targetUserId,
    });
    const redirectUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    for (const [key, value] of Object.entries(cachedResult.params)) {
      redirectUrl.searchParams.set(key, value);
    }
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(FASTMAIL_LINKING_STATE_COOKIE_NAME);
    return response;
  }

  const acquiredLock = await acquireOAuthCodeLock(code);
  if (!acquiredLock) {
    logger.info("OAuth code is being processed by another request", {
      targetUserId,
    });
    const redirectUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(FASTMAIL_LINKING_STATE_COOKIE_NAME);
    return response;
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(FASTMAIL_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error("Failed to exchange code for tokens", {
        status: tokenResponse.status,
        error: errorText,
      });
      const tokenError = new Error(
        `Failed to exchange code for tokens: ${tokenResponse.status}`,
      );
      captureException(tokenError);
      throw tokenError;
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      throw new Error("Missing access_token from Fastmail response");
    }

    if (!tokens.refresh_token) {
      logger.error(
        "Missing refresh_token from Fastmail OAuth response. Account will not be able to refresh tokens.",
      );
      throw new Error(
        "Missing refresh_token from Fastmail response. Please ensure offline_access scope is granted.",
      );
    }

    // Get user info from Fastmail
    let userInfo: { sub: string; email: string; name?: string };
    try {
      userInfo = await getUserInfo(tokens.access_token);
    } catch (userInfoError) {
      logger.error("Failed to fetch user info from Fastmail", {
        error: userInfoError,
      });
      throw userInfoError;
    }

    const providerAccountId = userInfo.sub;
    const providerEmail = userInfo.email;

    if (!providerAccountId || !providerEmail) {
      throw new Error(
        "User info missing required subject (sub) or email claim.",
      );
    }

    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: { provider: "fastmail", providerAccountId },
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
      provider: "fastmail",
      providerEmail,
      logger,
    });

    if (linkingResult.type === "redirect") {
      linkingResult.response.cookies.delete(FASTMAIL_LINKING_STATE_COOKIE_NAME);
      return linkingResult.response;
    }

    if (linkingResult.type === "continue_create") {
      logger.info("Creating new Fastmail account and linking to current user", {
        email: providerEmail,
        targetUserId,
      });

      try {
        const newAccount = await prisma.account.create({
          data: {
            userId: targetUserId,
            type: "oidc",
            provider: "fastmail",
            providerAccountId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expires_in
              ? new Date(Date.now() + tokens.expires_in * 1000)
              : null,
            scope: tokens.scope || "",
            token_type: tokens.token_type || "Bearer",
            id_token: tokens.id_token,
            emailAccount: {
              create: {
                email: providerEmail.toLowerCase(),
                userId: targetUserId,
                name: userInfo.name || null,
                image: null, // Fastmail doesn't provide profile photos
              },
            },
          },
        });

        logger.info("Successfully created and linked new Fastmail account", {
          email: providerEmail,
          targetUserId,
          accountId: newAccount.id,
        });
      } catch (createError: unknown) {
        if (isDuplicateError(createError)) {
          const accountNow = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: "fastmail",
                providerAccountId,
              },
            },
            select: { userId: true },
          });

          if (accountNow?.userId === targetUserId) {
            logger.info(
              "Account was created by concurrent request, continuing",
              {
                targetUserId,
                providerAccountId,
              },
            );
          } else {
            throw createError;
          }
        } else {
          throw createError;
        }
      }

      await setOAuthCodeResult(code, { success: "account_created_and_linked" });

      const successUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
      successUrl.searchParams.set("success", "account_created_and_linked");
      const successResponse = NextResponse.redirect(successUrl);
      successResponse.cookies.delete(FASTMAIL_LINKING_STATE_COOKIE_NAME);

      return successResponse;
    }

    if (linkingResult.type === "update_tokens") {
      logger.info("Updating tokens for existing Fastmail account", {
        email: providerEmail,
        targetUserId,
        accountId: linkingResult.existingAccountId,
      });

      await prisma.account.update({
        where: { id: linkingResult.existingAccountId },
        data: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : null,
          scope: tokens.scope || "",
          token_type: tokens.token_type || "Bearer",
          id_token: tokens.id_token,
        },
      });

      logger.info("Successfully updated tokens for Fastmail account", {
        email: providerEmail,
        targetUserId,
        accountId: linkingResult.existingAccountId,
      });

      await setOAuthCodeResult(code, { success: "tokens_updated" });

      const successUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
      successUrl.searchParams.set("success", "tokens_updated");
      const successResponse = NextResponse.redirect(successUrl);
      successResponse.cookies.delete(FASTMAIL_LINKING_STATE_COOKIE_NAME);

      return successResponse;
    }

    logger.info("Merging Fastmail account (user confirmed).", {
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

    await setOAuthCodeResult(code, { success: successMessage });

    const successUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    successUrl.searchParams.set("success", successMessage);
    const successResponse = NextResponse.redirect(successUrl);
    successResponse.cookies.delete(FASTMAIL_LINKING_STATE_COOKIE_NAME);

    return successResponse;
  } catch (error) {
    await clearOAuthCode(code);

    const errorUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    return handleOAuthCallbackError({
      error,
      redirectUrl: errorUrl,
      stateCookieName: FASTMAIL_LINKING_STATE_COOKIE_NAME,
      logger,
    });
  }
});
