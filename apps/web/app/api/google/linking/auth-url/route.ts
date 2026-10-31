import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import {
  checkAccountLinkingStart,
  getGoogleLinkingAuthUrl,
} from "@/utils/oauth/linking-start";
import { createOAuthLinkingAuditLogger } from "@/utils/oauth/linking-audit";
import {
  generateSignedOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetAuthLinkUrlResponse = { url: string };

export const GET = withAuth("google/linking/auth-url", async (request) => {
  const userId = request.auth.userId;

  const start = await checkAccountLinkingStart({
    request,
    provider: "google",
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
  const authUrl = getGoogleLinkingAuthUrl({ state, reconnectTarget });
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
