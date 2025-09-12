import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { Client } from "@microsoft/microsoft-graph-client";

const logger = createScopedLogger("teams/callback");
const TEAMS_AUTH_STATE_COOKIE_NAME = "teams_auth_state";

export const GET = withError(async (request: NextRequest) => {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new SafeError("Teams authentication not configured");
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(TEAMS_AUTH_STATE_COOKIE_NAME)?.value;

  const redirectUrl = new URL("/teams/installed", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during Teams callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    response.cookies.delete(TEAMS_AUTH_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  let decodedState: { userId: string; source: string; nonce: string };
  try {
    decodedState = JSON.parse(
      Buffer.from(storedState, "base64url").toString("utf8"),
    );
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    response.cookies.delete(TEAMS_AUTH_STATE_COOKIE_NAME);
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  response.cookies.delete(TEAMS_AUTH_STATE_COOKIE_NAME);

  const { userId } = decodedState;

  if (!code) {
    logger.warn("Missing code in Teams callback");
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: env.TEAMS_APP_ID || env.MICROSOFT_CLIENT_ID,
          client_secret: env.MICROSOFT_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/teams/callback`,
        }),
      },
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(
        tokens.error_description || "Failed to exchange code for tokens",
      );
    }

    // Get user profile and Teams information
    const client = Client.init({
      authProvider: (done) => {
        done(null, tokens.access_token);
      },
    });

    // Get user profile
    const profile = await client.api("/me").get();
    const email = profile.mail || profile.userPrincipalName;

    if (!email) {
      throw new Error("Profile missing required email");
    }

    // Get Teams tenant information
    const organization = await client.api("/organization").get();
    const tenant = organization.value?.[0];

    // Get user's teams
    const teamsResponse = await client.api("/me/joinedTeams").get();
    const teams = teamsResponse.value || [];

    // Store Teams app installation record
    await prisma.teamsInstallation.upsert({
      where: {
        tenantId_userId: {
          tenantId: tenant?.id || "unknown",
          userId,
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        tenantName: tenant?.displayName,
        installedTeams: teams.map((team: any) => ({
          id: team.id,
          displayName: team.displayName,
          description: team.description,
        })),
        updatedAt: new Date(),
      },
      create: {
        userId,
        tenantId: tenant?.id || "unknown",
        tenantName: tenant?.displayName,
        userEmail: email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        installedTeams: teams.map((team: any) => ({
          id: team.id,
          displayName: team.displayName,
          description: team.description,
        })),
      },
    });

    logger.info("Teams app installed successfully", {
      userId,
      tenantId: tenant?.id,
      teamsCount: teams.length,
    });

    redirectUrl.searchParams.set("success", "true");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  } catch (error) {
    logger.error("Error during Teams callback", { error, userId });
    
    if (error instanceof Error && error.message.includes("AADSTS")) {
      redirectUrl.searchParams.set("error", "auth_failed");
    } else {
      redirectUrl.searchParams.set("error", "installation_failed");
    }
    
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
});