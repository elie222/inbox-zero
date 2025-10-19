import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { withError } from "@/utils/middleware";
import { transferPremiumDuringMerge } from "@/utils/user/merge-premium";
import { parseOAuthState } from "@/utils/oauth/state";

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

  let decodedState: { userId: string; intent?: string; nonce: string };
  try {
    decodedState = parseOAuthState(storedState);
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);

  const { userId: targetUserId, intent } = decodedState;

  if (!code) {
    logger.warn("Missing code in Google linking callback");
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  const googleAuth = getLinkingOAuth2Client();

  try {
    const { tokens } = await googleAuth.getToken(code);
    const { id_token, access_token, refresh_token, expiry_date } = tokens;

    if (!id_token) {
      throw new Error("Missing id_token from Google response");
    }

    let payload: {
      sub?: string;
      email?: string;
      [key: string]: unknown;
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.error("ID token verification failed using googleAuth:", err);
      throw new Error(`ID token verification failed: ${errorMessage}`);
    }

    const providerAccountId = payload.sub;
    const providerEmail = payload.email;

    if (!providerAccountId || !providerEmail) {
      throw new Error(
        "ID token missing required subject (sub) or email claim.",
      );
    }

    // Handle Gmail onboarding case
    if (intent === "gmail") {
      // Check if Gmail is already connected for this user to prevent duplicate processing
      const existingEmailAccount = await prisma.emailAccount.findFirst({
        where: {
          userId: targetUserId,
          account: {
            refresh_token: { not: null },
          },
        },
        select: { id: true, account: { select: { refresh_token: true } } },
      });

      if (existingEmailAccount?.account?.refresh_token) {
        logger.info(
          "Gmail already connected for user, redirecting to teaser screen",
          {
            userId: targetUserId,
          },
        );
        const teaserUrl = new URL("/ready-for-brief", request.nextUrl.origin);
        return NextResponse.redirect(teaserUrl, { headers: response.headers });
      }

      // For Gmail onboarding, we need to update the existing account with Gmail permissions
      const emailAccount = await prisma.emailAccount.findFirst({
        where: { userId: targetUserId },
        select: { accountId: true },
      });

      if (emailAccount) {
        await prisma.account.update({
          where: { id: emailAccount.accountId },
          data: {
            access_token,
            refresh_token,
            expires_at: expiry_date ? new Date(expiry_date) : null,
          },
        });

        logger.info("Gmail connected successfully during onboarding", {
          userId: targetUserId,
          googleEmail: providerEmail,
        });

        // Redirect to teaser screen
        const teaserUrl = new URL("/ready-for-brief", request.nextUrl.origin);
        logger.info("Redirecting to teaser screen", {
          teaserUrl: teaserUrl.toString(),
        });
        return NextResponse.redirect(teaserUrl, { headers: response.headers });
      } else {
        logger.warn("No email account found for Gmail onboarding", {
          userId: targetUserId,
        });
        redirectUrl.searchParams.set("error", "no_email_account");
        return NextResponse.redirect(redirectUrl, {
          headers: response.headers,
        });
      }
    }

    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: { provider: "google", providerAccountId },
      },
      select: {
        id: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (!existingAccount) {
      logger.warn(
        "Merge Failed: Google account not found in the system. Cannot merge.",
        {
          email: providerEmail,
          providerAccountId,
        },
      );
      redirectUrl.searchParams.set("error", "account_not_found_for_merge");
      return NextResponse.redirect(redirectUrl, { headers: response.headers });
    }

    if (existingAccount.userId === targetUserId) {
      logger.warn(
        "Google account is already linked to the correct user. Merge action unnecessary.",
        {
          email: providerEmail,
          providerAccountId,
          userId: targetUserId,
        },
      );
      redirectUrl.searchParams.set("error", "already_linked_to_self");
      return NextResponse.redirect(redirectUrl, {
        headers: response.headers,
      });
    }

    logger.info(
      "Merging Google account linked to user, merging into target user.",
      {
        email: providerEmail,
        providerAccountId,
        existingUserId: existingAccount.userId,
        targetUserId,
      },
    );

    // Transfer premium subscription before deleting the source user
    await transferPremiumDuringMerge({
      sourceUserId: existingAccount.userId,
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

    logger.info("Account re-assigned to user. Original user was different.", {
      providerAccountId,
      targetUserId,
      originalUserId: existingAccount.userId,
    });
    redirectUrl.searchParams.set("success", "account_merged");
    return NextResponse.redirect(redirectUrl, {
      headers: response.headers,
    });
  } catch (error: unknown) {
    logger.error("Error in Google linking callback:", { error });

    // Handle invalid_grant error specifically for Gmail onboarding
    if (error.message?.includes("invalid_grant") && intent === "gmail") {
      logger.info(
        "Invalid grant error for Gmail onboarding - likely duplicate request, checking if already connected",
        {
          userId: targetUserId,
        },
      );

      // Check if Gmail is already connected for this user
      const existingEmailAccount = await prisma.emailAccount.findFirst({
        where: {
          userId: targetUserId,
          account: {
            refresh_token: { not: null },
          },
        },
        select: { id: true, account: { select: { refresh_token: true } } },
      });

      if (existingEmailAccount?.account?.refresh_token) {
        logger.info(
          "Gmail already connected for user, redirecting to teaser screen despite invalid_grant",
          {
            userId: targetUserId,
          },
        );
        const teaserUrl = new URL("/ready-for-brief", request.nextUrl.origin);
        return NextResponse.redirect(teaserUrl, { headers: response.headers });
      }
    }

    let errorCode = "link_failed";
    if (error.message?.includes("ID token verification failed")) {
      errorCode = "invalid_id_token";
    } else if (error.message?.includes("Missing id_token")) {
      errorCode = "missing_id_token";
    } else if (error.message?.includes("ID token missing required")) {
      errorCode = "incomplete_id_token";
    } else if (error.message?.includes("Missing access_token")) {
      errorCode = "token_exchange_failed";
    }
    redirectUrl.searchParams.set("error", errorCode);
    redirectUrl.searchParams.set(
      "error_description",
      error.message || "Unknown error",
    );
    response.cookies.delete(GOOGLE_LINKING_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
});
