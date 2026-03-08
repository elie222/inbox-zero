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
  classifyMicrosoftOAuthCallbackError,
  extractAadstsCode,
  getMissingMicrosoftScopes,
  getSafeMicrosoftOAuthErrorDescription,
  parseMicrosoftScopes,
} from "@/utils/oauth/microsoft-oauth";
import {
  acquireOAuthCodeLock,
  getOAuthCodeResult,
  setOAuthCodeResult,
  clearOAuthCode,
} from "@/utils/redis/oauth-code";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SCOPES as OUTLOOK_SCOPES } from "@/utils/outlook/scopes";
import type { Logger } from "@/utils/logger";

export const GET = withError("outlook/linking/callback", async (request) => {
  const logger = request.logger;
  const linkingRedirectUri = `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/linking/callback`;

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET)
    throw new SafeError("Microsoft login not enabled");

  const searchParams = request.nextUrl.searchParams;
  const storedState = request.cookies.get(
    OUTLOOK_LINKING_STATE_COOKIE_NAME,
  )?.value;
  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");
  const receivedState = searchParams.get("state");

  if (oauthError) {
    const invalidStateResponse = validateMicrosoftOAuthErrorState({
      receivedState,
      storedState,
      logger,
    });
    if (invalidStateResponse) {
      return invalidStateResponse;
    }

    return handleMicrosoftOAuthAuthorizeError({
      oauthError,
      errorDescription: oauthErrorDescription,
      logger,
    });
  }

  const validation = validateOAuthCallback({
    code: searchParams.get("code"),
    receivedState: searchParams.get("state"),
    storedState,
    stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
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
    response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
    return response;
  }

  const acquiredLock = await acquireOAuthCodeLock(code);
  if (!acquiredLock) {
    logger.info("OAuth code is being processed by another request", {
      targetUserId,
    });
    const redirectUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
    return response;
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
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
          redirect_uri: linkingRedirectUri,
        }),
      },
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      const errorDescription =
        tokens.error_description || "Failed to exchange code for tokens";
      const aadstsCode = extractAadstsCode(errorDescription);
      logger.error("Failed to exchange code for tokens", {
        error: errorDescription,
        aadstsCode,
        targetUserId,
        tenantId: env.MICROSOFT_TENANT_ID,
        redirectUri: linkingRedirectUri,
        requestedScopes: OUTLOOK_SCOPES,
      });
      captureException(new Error(errorDescription));
      throw new SafeError(errorDescription);
    }

    // Get user profile using the access token
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      logger.error("Failed to fetch Microsoft user profile", {
        targetUserId,
        status: profileResponse.status,
      });
      throw new SafeError("Failed to fetch user profile");
    }

    const profile = await profileResponse.json();
    const providerAccountId = profile.id;
    const providerEmail = profile.mail || profile.userPrincipalName;

    if (!providerAccountId || !providerEmail) {
      throw new SafeError("Profile missing required id or email");
    }

    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "microsoft",
          providerAccountId,
        },
      },
      select: {
        id: true,
        userId: true,
        refresh_token: true,
        user: { select: { name: true, email: true } },
        emailAccount: true,
      },
    });

    assertMicrosoftLinkingConsent({
      targetUserId,
      tokenScope: tokens.scope,
      hasRefreshToken: !!tokens.refresh_token,
      hasStoredRefreshToken: !!existingAccount?.refresh_token,
      logger,
    });

    const linkingResult = await handleAccountLinking({
      existingAccountId: existingAccount?.id || null,
      hasEmailAccount: !!existingAccount?.emailAccount,
      existingUserId: existingAccount?.userId || null,
      targetUserId,
      provider: "microsoft",
      providerEmail,
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

      try {
        const newAccount = await prisma.account.create({
          data: {
            userId: targetUserId,
            type: "oidc",
            provider: "microsoft",
            providerAccountId,
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
                providerAccountId,
              },
            },
            select: { id: true, userId: true },
          });

          if (accountNow?.userId === targetUserId) {
            logger.info(
              "Account already exists for same user, updating tokens",
              {
                targetUserId,
                providerAccountId,
                accountId: accountNow.id,
              },
            );

            await updateMicrosoftAccountTokens(accountNow.id, tokens);
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
      successResponse.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);

      return successResponse;
    }

    if (linkingResult.type === "update_tokens") {
      logger.info("Updating tokens for existing Microsoft account", {
        email: providerEmail,
        targetUserId,
        accountId: linkingResult.existingAccountId,
      });

      await updateMicrosoftAccountTokens(
        linkingResult.existingAccountId,
        tokens,
      );

      logger.info("Successfully updated tokens for Microsoft account", {
        email: providerEmail,
        targetUserId,
        accountId: linkingResult.existingAccountId,
      });

      await setOAuthCodeResult(code, { success: "tokens_updated" });

      const successUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
      successUrl.searchParams.set("success", "tokens_updated");
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

    const successUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    successUrl.searchParams.set("success", successMessage);
    const successResponse = NextResponse.redirect(successUrl);
    successResponse.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);

    return successResponse;
  } catch (error) {
    await clearOAuthCode(code);

    const errorUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    return handleOAuthCallbackError({
      error,
      redirectUrl: errorUrl,
      stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
      logger,
      provider: "microsoft",
    });
  }
});

interface MicrosoftTokens {
  access_token: string;
  expires_at?: number;
  expires_in?: string | number;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
}

function assertMicrosoftLinkingConsent(params: {
  targetUserId: string;
  tokenScope: string | null | undefined;
  hasRefreshToken: boolean;
  hasStoredRefreshToken: boolean;
  logger: Logger;
}) {
  const grantedScopes = parseMicrosoftScopes(params.tokenScope);
  const missingScopes = params.tokenScope
    ? getMissingMicrosoftScopes(params.tokenScope, OUTLOOK_SCOPES)
    : [];

  params.logger.info("Microsoft token exchange succeeded", {
    targetUserId: params.targetUserId,
    hasRefreshToken: params.hasRefreshToken,
    hasStoredRefreshToken: params.hasStoredRefreshToken,
    grantedScopeCount: grantedScopes.length,
    missingScopes,
  });

  if (
    (!params.hasRefreshToken && !params.hasStoredRefreshToken) ||
    missingScopes.length > 0
  ) {
    params.logger.warn("Microsoft linking returned incomplete consent", {
      targetUserId: params.targetUserId,
      hasRefreshToken: params.hasRefreshToken,
      hasStoredRefreshToken: params.hasStoredRefreshToken,
      grantedScopes,
      missingScopes,
      tenantId: env.MICROSOFT_TENANT_ID,
    });

    throw new SafeError(
      "Microsoft did not grant all required permissions. Please reconnect and approve every requested permission.",
    );
  }
}

function parseMicrosoftExpiresAt(tokens: MicrosoftTokens): Date | null {
  if (tokens.expires_at) {
    return new Date(tokens.expires_at * 1000);
  }
  if (tokens.expires_in) {
    const expiresInSeconds =
      typeof tokens.expires_in === "string"
        ? Number.parseInt(tokens.expires_in, 10)
        : tokens.expires_in;
    return new Date(Date.now() + expiresInSeconds * 1000);
  }
  return null;
}

async function updateMicrosoftAccountTokens(
  accountId: string,
  tokens: MicrosoftTokens,
) {
  await prisma.account.update({
    where: { id: accountId },
    data: {
      access_token: tokens.access_token,
      // Only update refresh_token if provider returned one (preserves existing token)
      ...(tokens.refresh_token != null && {
        refresh_token: tokens.refresh_token,
      }),
      expires_at: parseMicrosoftExpiresAt(tokens),
      scope: tokens.scope,
      token_type: tokens.token_type,
      disconnectedAt: null,
    },
  });

  // Force subscription renewal on next watch cycle after reconnect.
  // This avoids reusing stale subscription state that can survive token issues.
  await prisma.emailAccount.updateMany({
    where: { accountId },
    data: {
      watchEmailsExpirationDate: new Date(0),
    },
  });
}

function handleMicrosoftOAuthAuthorizeError(params: {
  oauthError: string;
  errorDescription: string | null;
  logger: Logger;
}) {
  const redirectUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
  const mappedError = classifyMicrosoftOAuthCallbackError({
    oauthError: params.oauthError,
    errorDescription: params.errorDescription,
  });

  params.logger.warn("Microsoft authorize callback returned an OAuth error", {
    oauthError: params.oauthError,
    aadstsCode: extractAadstsCode(params.errorDescription),
  });

  if (mappedError) {
    redirectUrl.searchParams.set("error", mappedError.errorCode);
    redirectUrl.searchParams.set("error_description", mappedError.userMessage);
  } else {
    redirectUrl.searchParams.set("error", "link_failed");
    const safeErrorDescription = getSafeMicrosoftOAuthErrorDescription(
      params.errorDescription,
    );
    if (safeErrorDescription) {
      redirectUrl.searchParams.set("error_description", safeErrorDescription);
    }
  }

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
  return response;
}

function validateMicrosoftOAuthErrorState(params: {
  receivedState: string | null;
  storedState: string | undefined;
  logger: Logger;
}) {
  if (
    params.storedState &&
    params.receivedState &&
    params.storedState === params.receivedState
  ) {
    return null;
  }

  params.logger.warn("Invalid state during Microsoft OAuth error callback", {
    receivedState: params.receivedState,
    hasStoredState: !!params.storedState,
  });

  const redirectUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
  redirectUrl.searchParams.set("error", "invalid_state");
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
  return response;
}
