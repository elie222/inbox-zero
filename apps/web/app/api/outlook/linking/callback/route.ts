import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";
import { withError } from "@/utils/middleware";
import { captureException, SafeError } from "@/utils/error";
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

export const GET = withError("outlook/linking/callback", async (request) => {
  const logger = request.logger;

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET)
    throw new SafeError("Microsoft login not enabled");

  const searchParams = request.nextUrl.searchParams;
  const storedState = request.cookies.get(
    OUTLOOK_LINKING_STATE_COOKIE_NAME,
  )?.value;

  const validation = validateOAuthCallback({
    code: searchParams.get("code"),
    receivedState: searchParams.get("state"),
    storedState,
    stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
    baseUrl: request.nextUrl.origin,
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
    const redirectUrl = new URL("/accounts", request.nextUrl.origin);
    for (const [key, value] of Object.entries(cachedResult.params)) {
      redirectUrl.searchParams.set(key, value);
    }
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
    return response;
  }

  const acquiredLock = await acquireOAuthCodeLock(code);
  if (!acquiredLock) {
    logger.info("OAuth code is being processed by another request", {
      targetUserId,
    });
    const redirectUrl = new URL("/accounts", request.nextUrl.origin);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
    return response;
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: env.MICROSOFT_CLIENT_ID,
          client_secret: env.MICROSOFT_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/linking/callback`,
        }),
      },
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      logger.error("Failed to exchange code for tokens", {
        error: tokens.error_description,
      });
      captureException(
        new Error(
          tokens.error_description || "Failed to exchange code for tokens",
        ),
      );
      throw new Error(
        tokens.error_description || "Failed to exchange code for tokens",
      );
    }

    // Get user profile using the access token
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new Error("Failed to fetch user profile");
    }

    const profile = await profileResponse.json();
    const providerEmail = profile.mail || profile.userPrincipalName;

    if (!providerEmail) {
      throw new Error("Profile missing required email");
    }

    const existingAccountByProviderId = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "microsoft",
          providerAccountId: profile.id || providerEmail,
        },
      },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true, email: true } },
        emailAccount: true,
      },
    });

    const existingAccountByEmail = await prisma.account.findFirst({
      where: {
        provider: "microsoft",
        user: {
          email: providerEmail.trim().toLowerCase(),
        },
      },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true, email: true } },
        emailAccount: true,
      },
    });

    const existingAccount =
      existingAccountByProviderId || existingAccountByEmail;

    const linkingResult = await handleAccountLinking({
      existingAccountId: existingAccount?.id || null,
      hasEmailAccount: !!existingAccount?.emailAccount,
      existingUserId: existingAccount?.userId || null,
      targetUserId,
      provider: "microsoft",
      providerEmail,
      baseUrl: request.nextUrl.origin,
      logger,
    });

    if (linkingResult.type === "redirect") {
      linkingResult.response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
      return linkingResult.response;
    }

    if (linkingResult.type === "continue_create") {
      logger.info(
        "Creating new Microsoft account and linking to current user",
        {
          email: providerEmail,
          targetUserId,
        },
      );

      let expiresAt: Date | null = null;
      if (tokens.expires_at) {
        expiresAt = new Date(tokens.expires_at * 1000);
      } else if (tokens.expires_in) {
        const expiresInSeconds =
          typeof tokens.expires_in === "string"
            ? Number.parseInt(tokens.expires_in, 10)
            : tokens.expires_in;
        expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
      }

      let profileImage = null;
      try {
        const photoResponse = await fetch(
          "https://graph.microsoft.com/v1.0/me/photo/$value",
          {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
          },
        );

        if (photoResponse.ok) {
          const photoBuffer = await photoResponse.arrayBuffer();
          const photoBase64 = Buffer.from(photoBuffer).toString("base64");
          profileImage = `data:image/jpeg;base64,${photoBase64}`;
        }
      } catch (error) {
        logger.warn("Failed to fetch profile picture", { error });
      }

      const microsoftProviderAccountId = profile.id || providerEmail;

      try {
        const newAccount = await prisma.account.create({
          data: {
            userId: targetUserId,
            type: "oidc",
            provider: "microsoft",
            providerAccountId: microsoftProviderAccountId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expiresAt,
            scope: tokens.scope,
            token_type: tokens.token_type,
            emailAccount: {
              create: {
                email: providerEmail,
                userId: targetUserId,
                name:
                  profile.displayName ||
                  profile.givenName ||
                  profile.surname ||
                  null,
                image: profileImage,
              },
            },
          },
        });

        logger.info("Successfully created and linked new Microsoft account", {
          email: providerEmail,
          targetUserId,
          accountId: newAccount.id,
        });
      } catch (createError: unknown) {
        if (isDuplicateError(createError)) {
          const accountNow = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: "microsoft",
                providerAccountId: microsoftProviderAccountId,
              },
            },
            select: { userId: true },
          });

          if (accountNow?.userId === targetUserId) {
            logger.info(
              "Account was created by concurrent request, continuing",
              {
                targetUserId,
                providerAccountId: microsoftProviderAccountId,
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

      const successUrl = new URL("/accounts", request.nextUrl.origin);
      successUrl.searchParams.set("success", "account_created_and_linked");
      const successResponse = NextResponse.redirect(successUrl);
      successResponse.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);

      return successResponse;
    }

    logger.info("Merging Microsoft account (user confirmed).", {
      email: providerEmail,
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

    logger.info("Account re-assigned to user.", {
      email: providerEmail,
      targetUserId,
      sourceUserId: linkingResult.sourceUserId,
      mergeType,
    });

    await setOAuthCodeResult(code, { success: successMessage });

    const successUrl = new URL("/accounts", request.nextUrl.origin);
    successUrl.searchParams.set("success", successMessage);
    const successResponse = NextResponse.redirect(successUrl);
    successResponse.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);

    return successResponse;
  } catch (error) {
    await clearOAuthCode(code);

    const errorUrl = new URL("/accounts", request.nextUrl.origin);
    return handleOAuthCallbackError({
      error,
      redirectUrl: errorUrl,
      stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
      logger,
    });
  }
});
