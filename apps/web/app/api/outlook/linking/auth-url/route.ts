import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getLinkingOAuth2Url } from "@/utils/outlook/client";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";
import { SCOPES as OUTLOOK_SCOPES } from "@/utils/outlook/scopes";
import { hasActiveAccountLinkingUser } from "@/utils/oauth/account-linking";
import {
  generateOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetOutlookAuthLinkUrlResponse = { url: string };

const getAuthUrl = ({ userId }: { userId: string }) => {
  const state = generateOAuthState({ userId });

  const baseUrl = getLinkingOAuth2Url();
  const url = `${baseUrl}&state=${state}`;

  return { url, state };
};

export const GET = withAuth("outlook/linking/auth-url", async (request) => {
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

  const { url: authUrl, state } = getAuthUrl({ userId });
  const parsedAuthUrl = new URL(authUrl);

  request.logger.info("Generated Microsoft email linking auth URL", {
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
