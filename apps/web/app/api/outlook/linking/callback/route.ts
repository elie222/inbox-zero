import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";
import { withError } from "@/utils/middleware";

const logger = createScopedLogger("outlook/linking/callback");

export const GET = withError(async (request: NextRequest) => {
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

  let decodedState: { userId: string; nonce: string };
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

  const { userId: targetUserId } = decodedState;

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
          client_id: env.MICROSOFT_CLIENT_ID!,
          client_secret: env.MICROSOFT_CLIENT_SECRET!,
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
    const providerAccountId = profile.id;
    const providerEmail = profile.mail || profile.userPrincipalName;

    if (!providerAccountId || !providerEmail) {
      throw new Error("Profile missing required id or email");
    }

    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "microsoft-entra-id",
          providerAccountId,
        },
      },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (!existingAccount) {
      logger.warn(
        `Merge Failed: Microsoft account ${providerEmail} (${providerAccountId}) not found in the system. Cannot merge.`,
      );
      redirectUrl.searchParams.set("error", "account_not_found_for_merge");
      return NextResponse.redirect(redirectUrl, { headers: response.headers });
    }

    if (existingAccount.userId === targetUserId) {
      logger.warn(
        `Microsoft account ${providerEmail} (${providerAccountId}) is already linked to the correct user ${targetUserId}. Merge action unnecessary.`,
      );
      redirectUrl.searchParams.set("error", "already_linked_to_self");
      return NextResponse.redirect(redirectUrl, {
        headers: response.headers,
      });
    }

    logger.info(
      `Merging Microsoft account ${providerEmail} (${providerAccountId}) linked to user ${existingAccount.userId}, merging into ${targetUserId}.`,
    );
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

    logger.info(
      `Account ${providerAccountId} re-assigned to user ${targetUserId}. Original user was ${existingAccount.userId}`,
    );
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
