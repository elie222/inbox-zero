import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { withError } from "@/utils/middleware";
import { validateOAuthCallback } from "@/utils/oauth/callback-validation";
import { handleAccountLinking } from "@/utils/oauth/account-linking";
import { mergeAccount } from "@/utils/user/merge-account";
import { handleOAuthCallbackError } from "@/utils/oauth/error-handler";
import {
  fetchGoogleOpenIdProfile,
  isGoogleOauthEmulationEnabled,
} from "@/utils/google/oauth";
import {
  acquireOAuthCodeLock,
  getOAuthCodeResult,
  setOAuthCodeResult,
  clearOAuthCode,
} from "@/utils/redis/oauth-code";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SafeError } from "@/utils/error";

export const GET = withError("google/linking/callback", async (request) => {
  const logger = request.logger;

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
    response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
    return response;
  }

  const acquiredLock = await acquireOAuthCodeLock(code);
  if (!acquiredLock) {
    logger.info("OAuth code is being processed by another request", {
      targetUserId,
    });
    const redirectUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
    return response;
  }

  const googleAuth = getLinkingOAuth2Client();

  try {
    const { tokens } = await googleAuth.getToken(code);
    const payload = await getGoogleProfilePayload({
      googleAuth,
      tokens,
      logger,
    });

    const providerAccountId = payload.sub;
    const providerEmail = payload.email;

    if (!providerAccountId || !providerEmail) {
      throw new SafeError(
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
      provider: "google",
      providerEmail,
      logger,
    });

    if (linkingResult.type === "redirect") {
      linkingResult.response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
      return linkingResult.response;
    }

    if (linkingResult.type === "continue_create") {
      if (isGoogleOauthEmulationEnabled()) {
        const existingEmulatedAccount = await prisma.emailAccount.findFirst({
          where: {
            email: providerEmail.trim().toLowerCase(),
            userId: targetUserId,
            account: {
              provider: "google",
            },
          },
          select: { accountId: true },
        });

        if (existingEmulatedAccount) {
          logger.info(
            "Updating existing Google emulator account for same user and email",
            {
              accountId: existingEmulatedAccount.accountId,
            },
          );

          await updateGoogleAccount({
            accountId: existingEmulatedAccount.accountId,
            providerAccountId,
            tokens,
          });

          await setOAuthCodeResult(code, { success: "tokens_updated" });

          const successUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
          successUrl.searchParams.set("success", "tokens_updated");
          const successResponse = NextResponse.redirect(successUrl);
          successResponse.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);

          return successResponse;
        }
      }

      logger.info("Creating new Google account and linking to current user", {
        email: providerEmail,
        targetUserId,
      });

      try {
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
            emailAccount: {
              create: {
                email: providerEmail,
                userId: targetUserId,
                name: payload.name || null,
                image: payload.picture,
              },
            },
          },
        });

        logger.info("Successfully created and linked new Google account", {
          email: providerEmail,
          targetUserId,
          accountId: newAccount.id,
        });
      } catch (createError: unknown) {
        if (isDuplicateError(createError)) {
          const accountNow = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: "google",
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

            await updateGoogleAccount({
              accountId: accountNow.id,
              tokens,
            });
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
      successResponse.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);

      return successResponse;
    }

    if (linkingResult.type === "update_tokens") {
      logger.info("Updating tokens for existing Google account", {
        email: providerEmail,
        targetUserId,
        accountId: linkingResult.existingAccountId,
      });

      await updateGoogleAccount({
        accountId: linkingResult.existingAccountId,
        tokens,
      });

      logger.info("Successfully updated tokens for Google account", {
        email: providerEmail,
        targetUserId,
        accountId: linkingResult.existingAccountId,
      });

      await setOAuthCodeResult(code, { success: "tokens_updated" });

      const successUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
      successUrl.searchParams.set("success", "tokens_updated");
      const successResponse = NextResponse.redirect(successUrl);
      successResponse.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);

      return successResponse;
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

    await setOAuthCodeResult(code, { success: successMessage });

    const successUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    successUrl.searchParams.set("success", successMessage);
    const successResponse = NextResponse.redirect(successUrl);
    successResponse.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);

    return successResponse;
  } catch (error) {
    await clearOAuthCode(code);

    const errorUrl = new URL("/accounts", env.NEXT_PUBLIC_BASE_URL);
    return handleOAuthCallbackError({
      error,
      redirectUrl: errorUrl,
      stateCookieName: GOOGLE_LINKING_STATE_COOKIE_NAME,
      logger,
    });
  }
});

interface GoogleTokens {
  access_token?: string | null;
  expiry_date?: number | null;
  id_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
}

async function updateGoogleAccount({
  accountId,
  providerAccountId,
  tokens,
}: {
  accountId: string;
  providerAccountId?: string;
  tokens: GoogleTokens;
}) {
  await prisma.account.update({
    where: { id: accountId },
    data: {
      ...(providerAccountId && {
        providerAccountId,
      }),
      access_token: tokens.access_token,
      ...(tokens.refresh_token != null && {
        refresh_token: tokens.refresh_token,
      }),
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scope: tokens.scope,
      token_type: tokens.token_type,
      id_token: tokens.id_token,
    },
  });
}

async function getGoogleProfilePayload({
  googleAuth,
  tokens,
  logger,
}: {
  googleAuth: ReturnType<typeof getLinkingOAuth2Client>;
  tokens: GoogleTokens;
  logger: Parameters<typeof handleOAuthCallbackError>[0]["logger"];
}) {
  if (isGoogleOauthEmulationEnabled()) {
    if (!tokens.access_token) {
      throw new SafeError("Missing access_token from Google response");
    }

    return fetchGoogleOpenIdProfile(tokens.access_token);
  }

  if (!tokens.id_token) {
    throw new SafeError("Missing id_token from Google response");
  }

  try {
    const ticket = await googleAuth.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new SafeError(
        "Could not get payload from verified ID token ticket.",
      );
    }

    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("ID token verification failed using googleAuth:", {
      error,
    });
    throw new SafeError(`ID token verification failed: ${message}`);
  }
}
