import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import {
  generateOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";
import {
  TEAMS_OAUTH_STATE_TYPE,
  TEAMS_SCOPES,
  TEAMS_STATE_COOKIE_NAME,
} from "@/utils/teams/constants";
import {
  getTeamsClientId,
  getTeamsOAuthBaseUrl,
  getTeamsRedirectUri,
  isTeamsOAuthConfigured,
} from "@/utils/teams/oauth";

export type GetTeamsAuthUrlResponse = {
  url: string;
};

export const GET = withEmailAccount("teams/auth-url", async (request) => {
  const { emailAccountId } = request.auth;

  if (!isTeamsOAuthConfigured()) {
    return NextResponse.json(
      { error: "Teams integration not configured" },
      { status: 503 },
    );
  }

  const state = generateOAuthState({
    emailAccountId,
    type: TEAMS_OAUTH_STATE_TYPE,
  });

  const params = new URLSearchParams({
    client_id: getTeamsClientId()!,
    response_type: "code",
    redirect_uri: getTeamsRedirectUri(),
    response_mode: "query",
    scope: TEAMS_SCOPES,
    state,
    prompt: "consent",
  });

  const url = `${getTeamsOAuthBaseUrl()}/authorize?${params.toString()}`;

  const response = NextResponse.json({ url } satisfies GetTeamsAuthUrlResponse);
  response.cookies.set(TEAMS_STATE_COOKIE_NAME, state, oauthStateCookieOptions);

  return response;
});
