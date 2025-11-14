import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";
import { withError } from "@/utils/middleware";
import { captureException, SafeError } from "@/utils/error";
import { validateOAuthCallback } from "@/utils/oauth/callback-validation";
import { handleAccountLinking } from "@/utils/oauth/account-linking";
import { mergeAccount } from "@/utils/user/merge-account";

const logger = createScopedLogger("outlook/linking/callback");

export const GET = withError(async (request) => {
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
    logger,
  });

  if (!validation.success) {
    return validation.response;
  }

  const { targetUserId, action, code } = validation;
  const redirectUrl = new URL("/accounts", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);

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
      action,
      provider: "microsoft",
      providerEmail,
      logger,
    });

    if (linkingResult.type === "redirect") {
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

      const newAccount = await prisma.account.create({
        data: {
          userId: targetUserId,
          type: "oidc",
          provider: "microsoft",
          providerAccountId: profile.id || providerEmail,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          scope: tokens.scope,
          token_type: tokens.token_type,
        },
      });

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

      await prisma.emailAccount.create({
        data: {
          email: providerEmail,
          userId: targetUserId,
          accountId: newAccount.id,
          name:
            profile.displayName ||
            profile.givenName ||
            profile.surname ||
            providerEmail,
          image: profileImage,
        },
      });

      logger.info("Successfully created and linked new Microsoft account", {
        email: providerEmail,
        targetUserId,
        accountId: newAccount.id,
      });
      redirectUrl.searchParams.set("success", "account_created_and_linked");
      return NextResponse.redirect(redirectUrl, {
        headers: response.headers,
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

    redirectUrl.searchParams.set("success", successMessage);
    return NextResponse.redirect(redirectUrl, {
      headers: response.headers,
    });
  } catch (error) {
    logger.error("Error in Outlook linking callback:", { error });
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    let errorCode = "link_failed";

    if (errorMessage.includes("Failed to exchange code")) {
      errorCode = "token_exchange_failed";
    } else if (errorMessage.includes("Failed to fetch user profile")) {
      errorCode = "profile_fetch_failed";
    } else if (errorMessage.includes("Profile missing required")) {
      errorCode = "incomplete_profile";
    }

    redirectUrl.searchParams.set("error", errorCode);
    redirectUrl.searchParams.set("error_description", errorMessage);
    response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
});
