import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { SCOPES } from "@/utils/gmail/scopes";
import { hasActiveAccountLinkingUser } from "@/utils/oauth/account-linking";
import { createOAuthLinkingAuditLogger } from "@/utils/oauth/linking-audit";
import {
  generateSignedOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetAuthLinkUrlResponse = { url: string };

const getAuthUrl = ({ userId }: { userId: string }) => {
  const googleAuth = getLinkingOAuth2Client();
  const stateNonce = randomUUID();

  const state = generateSignedOAuthState({ userId, nonce: stateNonce });

  const url = googleAuth.generateAuthUrl({
    access_type: "offline",
    scope: [...new Set([...SCOPES, "openid", "email"])].join(" "),
    prompt: "consent",
    state,
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

  const { url: authUrl, state, stateNonce } = getAuthUrl({ userId });
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
