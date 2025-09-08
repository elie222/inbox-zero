import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("outlook/linking/callback");

export const GET = withError(async (request: NextRequest) => {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET)
    throw new SafeError("Microsoft login not enabled");

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(
    OUTLOOK_LINKING_STATE_COOKIE_NAME,
  )?.value;

  const redirectUrl = new URL("/accounts", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during Outlook linking callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  let decodedState: { userId: string; action: string; nonce: string };
  try {
    decodedState = JSON.parse(
      Buffer.from(storedState, "base64url").toString("utf8"),
    );
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);

  const { userId: targetUserId, action } = decodedState;

  if (!code) {
    logger.warn("Missing code in Outlook linking callback");
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
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

    const existingAccount = await prisma.account.findFirst({
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
      },
    });

    if (!existingAccount) {
      if (action === "merge") {
        logger.warn(
          "Merge Failed: Microsoft account not found in the system. Cannot merge.",
          { email: providerEmail },
        );
        redirectUrl.searchParams.set("error", "account_not_found_for_merge");
        return NextResponse.redirect(redirectUrl, {
          headers: response.headers,
        });
      } else {
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
    }

    if (existingAccount.userId === targetUserId) {
      logger.warn(
        "Microsoft account is already linked to the correct user. Merge action unnecessary.",
        { email: providerEmail, targetUserId },
      );
      redirectUrl.searchParams.set("error", "already_linked_to_self");
      return NextResponse.redirect(redirectUrl, {
        headers: response.headers,
      });
    }

    logger.info("Merging Microsoft account linked to user.", {
      email: providerEmail,
      targetUserId,
    });
    await prisma.$transaction([
      prisma.account.update({
        where: { id: existingAccount.id },
        data: { userId: targetUserId },
      }),
      prisma.emailAccount.update({
        where: { accountId: existingAccount.id },
        data: {
          userId: targetUserId,
          name: existingAccount.user.name,
          email: existingAccount.user.email,
        },
      }),
      prisma.user.delete({
        where: { id: existingAccount.userId },
      }),
    ]);

    logger.info("Account re-assigned to user.", {
      email: providerEmail,
      targetUserId,
      sourceUserId: existingAccount.userId,
    });
    redirectUrl.searchParams.set("success", "account_merged");
    return NextResponse.redirect(redirectUrl, {
      headers: response.headers,
    });
  } catch (error: any) {
    logger.error("Error in Outlook linking callback:", { error });
    let errorCode = "link_failed";
    if (error.message?.includes("Failed to exchange code")) {
      errorCode = "token_exchange_failed";
    } else if (error.message?.includes("Failed to fetch user profile")) {
      errorCode = "profile_fetch_failed";
    } else if (error.message?.includes("Profile missing required")) {
      errorCode = "incomplete_profile";
    }
    redirectUrl.searchParams.set("error", errorCode);
    redirectUrl.searchParams.set(
      "error_description",
      error.message || "Unknown error",
    );
    response.cookies.delete(OUTLOOK_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
});
