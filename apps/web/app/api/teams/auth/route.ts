import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { env } from "@/env";
import { SafeError } from "@/utils/error";

export type GetTeamsAuthUrlResponse = { url: string };

const TEAMS_AUTH_STATE_COOKIE_NAME = "teams_auth_state";

const getTeamsAuthUrl = ({ userId, tenantId }: { userId: string; tenantId?: string }) => {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new SafeError("Teams authentication not configured");
  }

  const stateObject = { 
    userId, 
    source: "teams",
    nonce: crypto.randomUUID() 
  };
  const state = Buffer.from(JSON.stringify(stateObject)).toString("base64url");

  const tenant = tenantId || env.TEAMS_TENANT_ID || "common";
  const baseUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
  
  const params = new URLSearchParams({
    client_id: env.TEAMS_APP_ID || env.MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/teams/callback`,
    scope: [
      "openid",
      "profile", 
      "email",
      "User.Read",
      "Team.ReadBasic.All",
      "TeamSettings.Read.All",
      "offline_access"
    ].join(" "),
    state,
    prompt: "consent", // Always prompt for consent for Teams apps
  });

  return { url: `${baseUrl}?${params.toString()}`, state };
};

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId") || undefined;
  
  const { url: authUrl, state } = getTeamsAuthUrl({ userId, tenantId });

  const response = NextResponse.json({ url: authUrl });

  response.cookies.set(TEAMS_AUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
    sameSite: "lax",
  });

  return response;
});