import { NextResponse } from "next/server";
import { env } from "@/env";
import { withEmailAccount } from "@/utils/middleware";
import {
  SLACK_STATE_COOKIE_NAME,
  SLACK_OAUTH_STATE_TYPE,
  SLACK_SCOPES,
} from "@/utils/slack/constants";
import {
  generateSignedOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetSlackAuthUrlResponse = { url: string };

export const GET = withEmailAccount("slack/auth-url", async (request) => {
  const { emailAccountId } = request.auth;

  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Slack integration not configured" },
      { status: 503 },
    );
  }

  const { url, state, redirectUri } = getAuthUrl({ emailAccountId });

  request.logger.info("Slack auth URL generated", {
    redirectUri,
    clientId: env.SLACK_CLIENT_ID,
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
    webhookUrl: env.WEBHOOK_URL ?? null,
  });

  const res: GetSlackAuthUrlResponse = { url };
  const response = NextResponse.json(res);

  response.cookies.set(SLACK_STATE_COOKIE_NAME, state, oauthStateCookieOptions);

  return response;
});

function getAuthUrl({ emailAccountId }: { emailAccountId: string }) {
  const state = generateSignedOAuthState({
    emailAccountId,
    type: SLACK_OAUTH_STATE_TYPE,
  });

  const redirectUri = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/slack/callback`;

  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID!,
    scope: SLACK_SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  const url = `https://slack.com/oauth/v2/authorize?${params.toString()}`;

  return { url, state, redirectUri };
}
