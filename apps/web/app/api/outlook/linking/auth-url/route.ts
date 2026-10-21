import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";
import { SCOPES as OUTLOOK_SCOPES } from "@/utils/outlook/scopes";
import {
  checkAccountLinkingStart,
  getMicrosoftLinkingAuthUrl,
} from "@/utils/oauth/linking-start";
import { createOAuthLinkingAuditLogger } from "@/utils/oauth/linking-audit";
import {
  generateSignedOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetOutlookAuthLinkUrlResponse = { url: string };

export const GET = withAuth("outlook/linking/auth-url", async (request) => {
  const userId = request.auth.userId;

  const start = await checkAccountLinkingStart({
    request,
    provider: "microsoft",
    reconnectEmailAccountId: request.nextUrl.searchParams.get("emailAccountId"),
  });
  if (start.response) return start.response;
  const { reconnectTarget } = start;

  const stateNonce = randomUUID();
  const state = generateSignedOAuthState({
    userId,
    nonce: stateNonce,
    ...(reconnectTarget && { reconnectEmailAccountId: reconnectTarget.id }),
  });
  const authUrl = getMicrosoftLinkingAuthUrl({ state, reconnectTarget });
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
