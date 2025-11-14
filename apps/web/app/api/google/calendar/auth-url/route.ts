import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getCalendarOAuth2Client } from "@/utils/calendar/client";
import { CALENDAR_STATE_COOKIE_NAME } from "@/utils/calendar/constants";
import { CALENDAR_SCOPES } from "@/utils/gmail/scopes";
import {
  generateOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetCalendarAuthUrlResponse = { url: string };

const getAuthUrl = ({ emailAccountId }: { emailAccountId: string }) => {
  const oauth2Client = getCalendarOAuth2Client();

  const state = generateOAuthState({
    emailAccountId,
    type: "calendar",
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: CALENDAR_SCOPES,
    state,
    prompt: "consent",
  });

  return { url, state };
};

export const GET = withEmailAccount(
  "google/calendar/auth-url",
  async (request) => {
    const { emailAccountId } = request.auth;
    const { url, state } = getAuthUrl({ emailAccountId });

    const res: GetCalendarAuthUrlResponse = { url };
    const response = NextResponse.json(res);

    response.cookies.set(
      CALENDAR_STATE_COOKIE_NAME,
      state,
      oauthStateCookieOptions,
    );

    return response;
  },
);
