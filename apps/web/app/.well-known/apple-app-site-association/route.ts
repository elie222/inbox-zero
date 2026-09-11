import { NextResponse } from "next/server";
import { env } from "@/env";

const AUTH_CALLBACK_PATHS = ["/auth-callback", "/auth-callback/*"];

export function GET() {
  const appId =
    env.APPLE_TEAM_ID && env.APPLE_APP_BUNDLE_IDENTIFIER
      ? `${env.APPLE_TEAM_ID}.${env.APPLE_APP_BUNDLE_IDENTIFIER}`
      : null;
  const details = appId ? [{ appID: appId, paths: AUTH_CALLBACK_PATHS }] : [];

  return NextResponse.json(
    { applinks: { apps: [], details } },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "application/json",
      },
    },
  );
}
