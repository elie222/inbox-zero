import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { SCOPES } from "@/utils/gmail/scopes";

export type GetAuthLinkUrlResponse = { url: string };

const getAuthUrl = ({ userId }: { userId: string }) => {
  const googleAuth = getLinkingOAuth2Client();

  const stateObject = { userId, nonce: crypto.randomUUID() };
  const state = Buffer.from(JSON.stringify(stateObject)).toString("base64url");

  const url = googleAuth.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES.join(" "),
    state,
  });

  return { url, state };
};

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const { url, state } = getAuthUrl({ userId });

  const response = NextResponse.json({ url });

  response.cookies.set(GOOGLE_LINKING_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
  });

  return response;
});
