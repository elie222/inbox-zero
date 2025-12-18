import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import {
  getLinkingOAuth2Config,
  FASTMAIL_OAUTH_AUTHORIZE_URL,
} from "@/utils/fastmail/client";
import { FASTMAIL_LINKING_STATE_COOKIE_NAME } from "@/utils/fastmail/constants";
import { SCOPES } from "@/utils/fastmail/scopes";
import {
  generateOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetAuthLinkUrlResponse = { url: string };

const getAuthUrl = ({ userId }: { userId: string }) => {
  const config = getLinkingOAuth2Config();
  const state = generateOAuthState({ userId });

  // Build OAuth authorization URL
  // Use offline_access scope (OIDC standard) to get refresh token - access_type is Google-specific
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: [
      ...new Set([...SCOPES, "openid", "email", "profile", "offline_access"]),
    ].join(" "),
    state,
    prompt: "consent",
  });

  const url = `${FASTMAIL_OAUTH_AUTHORIZE_URL}?${params.toString()}`;

  return { url, state };
};

export const GET = withAuth("fastmail/linking/auth-url", async (request) => {
  const userId = request.auth.userId;
  const { url: authUrl, state } = getAuthUrl({ userId });

  const response = NextResponse.json({ url: authUrl });

  response.cookies.set(
    FASTMAIL_LINKING_STATE_COOKIE_NAME,
    state,
    oauthStateCookieOptions,
  );

  return response;
});
