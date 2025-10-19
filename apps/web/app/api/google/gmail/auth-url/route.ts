import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { SCOPES } from "@/utils/gmail/scopes";
import {
  generateOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetGmailAuthUrlResponse = { url: string };

const getAuthUrl = ({ userId }: { userId: string }) => {
  const oauth2Client = getLinkingOAuth2Client();

  const state = generateOAuthState({
    userId,
    intent: "gmail",
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state,
    prompt: "consent",
  });

  return { url, state };
};

export const GET = withAuth(async (request) => {
  const { userId } = request.auth;

  const { url, state } = getAuthUrl({ userId });

  const res: GetGmailAuthUrlResponse = { url };
  const response = NextResponse.json(res);

  response.cookies.set(
    GOOGLE_LINKING_STATE_COOKIE_NAME,
    state,
    oauthStateCookieOptions,
  );

  return response;
});
