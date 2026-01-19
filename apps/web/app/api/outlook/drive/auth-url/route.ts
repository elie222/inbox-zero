import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getMicrosoftDriveOAuth2Url } from "@/utils/drive/client";
import { DRIVE_STATE_COOKIE_NAME } from "@/utils/drive/constants";
import {
  generateOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetDriveAuthUrlResponse = { url: string };

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;
  const { url, state } = getAuthUrl({ emailAccountId });

  const res: GetDriveAuthUrlResponse = { url };
  const response = NextResponse.json(res);

  response.cookies.set(DRIVE_STATE_COOKIE_NAME, state, oauthStateCookieOptions);

  return response;
});

const getAuthUrl = ({ emailAccountId }: { emailAccountId: string }) => {
  const state = generateOAuthState({
    emailAccountId,
    type: "drive",
  });

  const url = getMicrosoftDriveOAuth2Url(state);

  return { url, state };
};
