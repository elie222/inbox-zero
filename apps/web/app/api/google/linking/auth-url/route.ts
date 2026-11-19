import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { getAccountLinkingAuthorizationUrl } from "@/utils/oauth/linking-auth-url";
import { hasActiveAccountLinkingUser } from "@/utils/oauth/account-linking";
import { findReconnectTarget } from "@/utils/oauth/reconnect-target";
import { createOAuthLinkingAuditLogger } from "@/utils/oauth/linking-audit";
import {
  generateSignedOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetAuthLinkUrlResponse = { url: string };

const getAuthUrl = ({
  userId,
  reconnectTarget,
}: {
  userId: string;
  reconnectTarget: { id: string; email: string } | null;
}) => {
  const stateNonce = randomUUID();

  const state = generateSignedOAuthState({
    type: "account-linking",
    provider: "google",
    userId,
    nonce: stateNonce,
    ...(reconnectTarget && { reconnectEmailAccountId: reconnectTarget.id }),
  });

  const url = getAccountLinkingAuthorizationUrl({
    provider: "google",
    state,
    // Reconnects target one mailbox, so point Google at it rather than letting
    // whichever account the browser is already signed into decide.
    loginHint: reconnectTarget?.email,
  });

  return { url, state, stateNonce };
};

export const GET = withAuth("google/linking/auth-url", async (request) => {
  const userId = request.auth.userId;

  const hasActiveUser = await hasActiveAccountLinkingUser({
    targetUserId: userId,
    logger: request.logger,
  });

  if (!hasActiveUser) {
    return NextResponse.json(
      { error: "Unauthorized", isKnownError: true, redirectTo: "/logout" },
      { status: 401 },
    );
  }

  const reconnectEmailAccountId =
    request.nextUrl.searchParams.get("emailAccountId");
  const reconnectTarget = reconnectEmailAccountId
    ? await findReconnectTarget({
        emailAccountId: reconnectEmailAccountId,
        userId,
        provider: "google",
      })
    : null;

  // Falling back to an unconstrained link would reconnect whichever mailbox the
  // browser is signed into, which is the outcome the target exists to prevent.
  if (reconnectEmailAccountId && !reconnectTarget) {
    return NextResponse.json(
      { error: "Account not found", isKnownError: true },
      { status: 404 },
    );
  }

  const {
    url: authUrl,
    state,
    stateNonce,
  } = getAuthUrl({ userId, reconnectTarget });
  const logger = createOAuthLinkingAuditLogger({
    actorUserId: userId,
    logger: request.logger,
    provider: "google",
    stateNonce,
    targetUserId: userId,
  });

  logger.info("OAuth linking flow initiated");

  const response = NextResponse.json({ url: authUrl });

  response.cookies.set(
    GOOGLE_LINKING_STATE_COOKIE_NAME,
    state,
    oauthStateCookieOptions,
  );

  return response;
});
