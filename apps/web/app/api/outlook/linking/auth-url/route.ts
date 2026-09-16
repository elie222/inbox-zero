import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getLinkingOAuth2Url } from "@/utils/outlook/client";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";
import { SCOPES as OUTLOOK_SCOPES } from "@/utils/outlook/scopes";
import {
  getMailboxLinkingBlockedResponse,
  hasActiveAccountLinkingUser,
} from "@/utils/oauth/account-linking";
import { findReconnectTarget } from "@/utils/oauth/reconnect-target";
import { createOAuthLinkingAuditLogger } from "@/utils/oauth/linking-audit";
import {
  generateSignedOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetOutlookAuthLinkUrlResponse = { url: string };

const getAuthUrl = ({
  userId,
  reconnectTarget,
}: {
  userId: string;
  reconnectTarget: { id: string; email: string } | null;
}) => {
  const stateNonce = randomUUID();
  const state = generateSignedOAuthState({
    userId,
    nonce: stateNonce,
    ...(reconnectTarget && { reconnectEmailAccountId: reconnectTarget.id }),
  });

  const baseUrl = getLinkingOAuth2Url({ loginHint: reconnectTarget?.email });
  const url = `${baseUrl}&state=${state}`;

  return { url, state, stateNonce };
};

export const GET = withAuth("outlook/linking/auth-url", async (request) => {
  const userId = request.auth.userId;

  const blockedResponse = getMailboxLinkingBlockedResponse(request);
  if (blockedResponse) return blockedResponse;

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
        provider: "microsoft",
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
  const parsedAuthUrl = new URL(authUrl);
  const logger = createOAuthLinkingAuditLogger({
    actorUserId: userId,
    logger: request.logger,
    provider: "microsoft",
    stateNonce,
    targetUserId: userId,
  });

  logger.info("OAuth linking flow initiated");

  logger.info("Generated Microsoft email linking auth URL", {
    prompt: parsedAuthUrl.searchParams.get("prompt"),
    redirectUri: parsedAuthUrl.searchParams.get("redirect_uri"),
    requestedScopes: OUTLOOK_SCOPES,
  });

  const response = NextResponse.json({ url: authUrl });

  response.cookies.set(
    OUTLOOK_LINKING_STATE_COOKIE_NAME,
    state,
    oauthStateCookieOptions,
  );

  return response;
});
