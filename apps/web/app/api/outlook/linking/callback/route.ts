import { env } from "@/env";
import { auth } from "@/utils/auth";
import { hash } from "@/utils/hash";
import prisma from "@/utils/prisma";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";
import { withError } from "@/utils/middleware";
import { captureException, SafeError } from "@/utils/error";
import { validateOAuthCallback } from "@/utils/oauth/callback-validation";
import { handleAccountLinking } from "@/utils/oauth/account-linking";
import { createAccountLinkingRedirect } from "@/utils/oauth/account-linking-redirect";
import { mergeAccount } from "@/utils/user/merge-account";
import { handleOAuthCallbackError } from "@/utils/oauth/error-handler";
import { hasValidMatchingSignedOAuthState } from "@/utils/oauth/callback-validation";
import {
  hashOAuthAuditIdentifier,
  logOAuthLinkingCallbackValidation,
} from "@/utils/oauth/linking-audit";
import {
  classifyMicrosoftOAuthCallbackError,
  extractAadstsCode,
  getMissingMicrosoftScopes,
  getSafeMicrosoftOAuthErrorDescription,
  parseMicrosoftScopes,
} from "@/utils/oauth/microsoft-oauth";
import {
  getMicrosoftGraphUrl,
  requestMicrosoftToken,
} from "@/utils/microsoft/oauth";
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
  const actorUserId = (await auth())?.user.id ?? null;
  let logger = request.logger.with({
    actorUserId,
    auditType: "oauth_linking",
    hasActorSession: !!actorUserId,
    provider: "microsoft",
  });
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
      redirectUri: linkingRedirectUri,
      requestedScopes: OUTLOOK_SCOPES,
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

  const { targetUserId, code, stateNonce } = validation;
  logger = logOAuthLinkingCallbackValidation({
    actorUserId,
    logger,
    provider: "microsoft",
    stateNonce,
    targetUserId,
  });

  if (actorUserId && actorUserId !== targetUserId) {
    return createAccountLinkingRedirect({
      query: { error: "invalid_state" },
      stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
    });
  }

  const cachedResult = await getOAuthCodeResult(code);
  if (cachedResult) {
    logger.info("OAuth code already processed, returning cached result", {
      targetUserId,
    });
    return createAccountLinkingRedirect({
      query: cachedResult.params,
      stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
    });
  }

  const acquiredLock = await acquireOAuthCodeLock(code);
  if (!acquiredLock) {
    logger.info("OAuth code is being processed by another request", {
      targetUserId,
    });
    return createAccountLinkingRedirect({
      stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
    });
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await requestMicrosoftToken({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: linkingRedirectUri,
    });

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
    const profileResponse = await fetch(getMicrosoftGraphUrl("/me"), {
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
          getMicrosoftGraphUrl("/me/photo/$value"),
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
        logger.info("OAuth linking callback completed", {
          accountId: newAccount.id,
          outcome: "account_created_and_linked",
          providerEmailHash: hash(providerEmail),
          providerSubjectHash: hashOAuthAuditIdentifier(providerAccountId),
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
            logger.info("OAuth linking callback completed", {
              accountId: accountNow.id,
              outcome: "tokens_updated",
              providerEmailHash: hash(providerEmail),
              providerSubjectHash: hashOAuthAuditIdentifier(providerAccountId),
            });
          } else {
            throw createError;
          }
        } else {
          throw createError;
        }
      }

      await setOAuthCodeResult(code, { success: "account_created_and_linked" });
      return createAccountLinkingRedirect({
        query: { success: "account_created_and_linked" },
        stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
      });
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
      logger.info("OAuth linking callback completed", {
        accountId: linkingResult.existingAccountId,
        outcome: "tokens_updated",
        providerEmailHash: hash(providerEmail),
        providerSubjectHash: hashOAuthAuditIdentifier(providerAccountId),
      });

      await setOAuthCodeResult(code, { success: "tokens_updated" });
      return createAccountLinkingRedirect({
        query: { success: "tokens_updated" },
        stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
      });
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
    logger.info("OAuth linking callback completed", {
      outcome: successMessage,
      providerEmailHash: hash(providerEmail),
      providerSubjectHash: hashOAuthAuditIdentifier(providerAccountId),
      sourceUserId: linkingResult.sourceUserId,
    });

    await setOAuthCodeResult(code, { success: successMessage });
    return createAccountLinkingRedirect({
      query: { success: successMessage },
      stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
    });
  } catch (error) {
    await clearOAuthCode(code);
    return handleOAuthCallbackError({
      error,
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

const MICROSOFT_LINKING_SCOPES_TO_VALIDATE = OUTLOOK_SCOPES.filter(
  (scope) =>
    !["openid", "profile", "email", "User.Read", "offline_access"].includes(
      scope,
    ),
);

function assertMicrosoftLinkingConsent(params: {
  targetUserId: string;
  tokenScope: string | null | undefined;
  hasRefreshToken: boolean;
  hasStoredRefreshToken: boolean;
  logger: Logger;
}) {
  const grantedScopes = parseMicrosoftScopes(params.tokenScope);
  const missingScopes = params.tokenScope
    ? getMissingMicrosoftScopes(
        params.tokenScope,
        MICROSOFT_LINKING_SCOPES_TO_VALIDATE,
      )
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
  redirectUri: string;
  requestedScopes: readonly string[];
}) {
  const mappedError = classifyMicrosoftOAuthCallbackError({
    oauthError: params.oauthError,
    errorDescription: params.errorDescription,
  });

  params.logger.warn("Microsoft authorize callback returned an OAuth error", {
    oauthError: params.oauthError,
    aadstsCode: extractAadstsCode(params.errorDescription),
    errorDescription: params.errorDescription,
    redirectUri: params.redirectUri,
    requestedScopes: params.requestedScopes,
    safeErrorDescription: getSafeMicrosoftOAuthErrorDescription(
      params.errorDescription,
    ),
  });

  if (mappedError) {
    return createAccountLinkingRedirect({
      query: {
        error: mappedError.errorCode,
        error_description: mappedError.userMessage,
      },
      stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
    });
  }

  return createAccountLinkingRedirect({
    query: {
      error: "link_failed",
      error_description: getSafeMicrosoftOAuthErrorDescription(
        params.errorDescription,
      ),
    },
    stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
  });
}

function validateMicrosoftOAuthErrorState(params: {
  receivedState: string | null;
  storedState: string | undefined;
  logger: Logger;
}) {
  if (
    hasValidMatchingSignedOAuthState({
      receivedState: params.receivedState,
      storedState: params.storedState,
      logger: params.logger,
    })
  ) {
    return null;
  }

  params.logger.warn("Invalid state during Microsoft OAuth error callback", {
    receivedState: params.receivedState,
    hasStoredState: !!params.storedState,
  });
  return createAccountLinkingRedirect({
    query: { error: "invalid_state" },
    stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
  });
}
