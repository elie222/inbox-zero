import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getLinkingOAuth2Url } from "@/utils/outlook/client";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";

export type GetOutlookAuthLinkUrlResponse = { url: string };

const getAuthUrl = ({ userId, action }: { userId: string; action: string }) => {
  const stateObject = { userId, action, nonce: crypto.randomUUID() };
  const state = Buffer.from(JSON.stringify(stateObject)).toString("base64url");

  const baseUrl = getLinkingOAuth2Url();
  const url = `${baseUrl}&state=${state}`;

  return { url, state };
};

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "merge";
  const { url: authUrl, state } = getAuthUrl({ userId, action });

  const response = NextResponse.json({ url: authUrl });

  response.cookies.set(OUTLOOK_LINKING_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    maxAge: 60 * 10,
    path: "/",
    sameSite: "lax",
  });

  return response;
});
