import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getLinkingOAuth2Url } from "@/utils/outlook/client";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";

export type GetOutlookAuthLinkUrlResponse = { url: string };

const getAuthUrl = ({ userId }: { userId: string }) => {
  const stateObject = { userId, nonce: crypto.randomUUID() };
  const state = Buffer.from(JSON.stringify(stateObject)).toString("base64url");

  const baseUrl = getLinkingOAuth2Url();
  const url = `${baseUrl}&state=${state}`;

  return { url, state };
};

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const { url, state } = getAuthUrl({ userId });

  const response = NextResponse.json({ url });

  response.cookies.set(OUTLOOK_LINKING_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
  });

  return response;
});
