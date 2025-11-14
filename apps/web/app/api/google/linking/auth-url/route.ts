import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/utils/middleware";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { SCOPES } from "@/utils/gmail/scopes";
import {
  generateOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export type GetAuthLinkUrlResponse = { url: string };

const actionSchema = z.enum(["auto", "merge_confirmed"]);

const getAuthUrl = ({
  userId,
  action,
}: {
  userId: string;
  action: "auto" | "merge_confirmed";
}) => {
  const googleAuth = getLinkingOAuth2Client();

  const state = generateOAuthState({ userId, action });

  const url = googleAuth.generateAuthUrl({
    access_type: "offline",
    scope: [...new Set([...SCOPES, "openid", "email"])].join(" "),
    prompt: "consent",
    state,
  });

  return { url, state };
};

export const GET = withAuth("google/linking/auth-url", async (request) => {
  const userId = request.auth.userId;
  const url = new URL(request.url);

  const actionParam = url.searchParams.get("action");
  const parseResult = actionSchema.safeParse(actionParam);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error:
          "Invalid or missing action parameter. Must be 'auto' or 'merge_confirmed'.",
      },
      { status: 400 },
    );
  }

  const action = parseResult.data;
  const { url: authUrl, state } = getAuthUrl({ userId, action });

  const response = NextResponse.json({ url: authUrl });

  response.cookies.set(
    GOOGLE_LINKING_STATE_COOKIE_NAME,
    state,
    oauthStateCookieOptions,
  );

  return response;
});
