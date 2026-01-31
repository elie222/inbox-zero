import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import {
  getGoogleDriveOAuth2Url,
  type GoogleDriveAccessLevel,
} from "@/utils/drive/client";
import { DRIVE_STATE_COOKIE_NAME } from "@/utils/drive/constants";
import {
  generateOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetDriveAuthUrlResponse = { url: string };

export const GET = withEmailAccount(
  "google/drive/auth-url",
  async (request) => {
    const { emailAccountId } = request.auth;
    const { searchParams } = new URL(request.url);
    const accessLevel = getAccessLevel(searchParams);
    const { url, state } = getAuthUrl({ emailAccountId, accessLevel });

    const res: GetDriveAuthUrlResponse = { url };
    const response = NextResponse.json(res);

    response.cookies.set(
      DRIVE_STATE_COOKIE_NAME,
      state,
      oauthStateCookieOptions,
    );

    return response;
  },
);

const getAuthUrl = ({
  emailAccountId,
  accessLevel,
}: {
  emailAccountId: string;
  accessLevel: GoogleDriveAccessLevel;
}) => {
  const state = generateOAuthState({
    emailAccountId,
    type: "drive",
  });

  const url = getGoogleDriveOAuth2Url(state, accessLevel);

  return { url, state };
};

function getAccessLevel(params: URLSearchParams): GoogleDriveAccessLevel {
  return params.get("access") === "full" ? "full" : "limited";
}
