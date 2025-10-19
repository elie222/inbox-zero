import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { withError } from "@/utils/middleware";
import { GMAIL_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { parseOAuthState } from "@/utils/oauth/state";
import { auth } from "@/utils/auth";

const logger = createScopedLogger("google/gmail/callback");

export const GET = withError(async (request) => {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(GMAIL_STATE_COOKIE_NAME)?.value;

  let redirectUrl = new URL("/connect-gmail", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.delete(GMAIL_STATE_COOKIE_NAME);

  if (!code) {
    logger.warn("Missing code in Gmail callback");
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during Gmail callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  let decodedState: { emailAccountId: string; type: string; nonce: string };
  try {
    decodedState = parseOAuthState(storedState);
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (decodedState.type !== "gmail") {
    logger.error("Invalid state type for Gmail callback", {
      type: decodedState.type,
    });
    redirectUrl.searchParams.set("error", "invalid_state_type");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  const { emailAccountId } = decodedState;

  // Verify user owns this email account
  const session = await auth();
  if (!session?.user?.id) {
    logger.warn("Unauthorized Gmail callback - no session");
    redirectUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  const emailAccount = await prisma.emailAccount.findFirst({
    where: {
      id: emailAccountId,
      userId: session.user.id,
    },
    select: { id: true, accountId: true },
  });

  if (!emailAccount) {
    logger.warn("Unauthorized Gmail callback - invalid email account", {
      emailAccountId,
      userId: session.user.id,
    });
    redirectUrl.searchParams.set("error", "forbidden");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  const googleAuth = getLinkingOAuth2Client();

  try {
    const { tokens } = await googleAuth.getToken(code);
    const { id_token, access_token, refresh_token, expiry_date } = tokens;

    if (!id_token) {
      throw new Error("Missing id_token from Google response");
    }

    if (!access_token || !refresh_token) {
      logger.warn("No refresh_token returned from Google", { emailAccountId });
      redirectUrl.searchParams.set("error", "missing_refresh_token");
      return NextResponse.redirect(redirectUrl, { headers: response.headers });
    }

    const ticket = await googleAuth.verifyIdToken({
      idToken: id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      throw new Error("Could not get email from ID token");
    }

    const googleEmail = payload.email;

    // Update the existing account with new tokens that have Gmail permissions
    await prisma.account.update({
      where: { id: emailAccount.accountId },
      data: {
        access_token,
        refresh_token,
        expires_at: expiry_date ? new Date(expiry_date) : null,
      },
    });

    logger.info("Gmail connected successfully", {
      emailAccountId,
      googleEmail,
    });

    // Redirect to ready-for-brief page after successful connection
    redirectUrl = new URL("/ready-for-brief", request.nextUrl.origin);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  } catch (error) {
    logger.error("Error in Gmail callback", { error, emailAccountId });
    redirectUrl.searchParams.set("error", "connection_failed");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
});
