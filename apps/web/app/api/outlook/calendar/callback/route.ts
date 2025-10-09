import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  fetchMicrosoftCalendars,
  getCalendarClientWithRefresh,
} from "@/utils/outlook/calendar-client";
import { withError } from "@/utils/middleware";
import { CALENDAR_STATE_COOKIE_NAME } from "@/utils/calendar/constants";
import { parseOAuthState } from "@/utils/oauth/state";
import { auth } from "@/utils/auth";

const logger = createScopedLogger("outlook/calendar/callback");

export const GET = withError(async (request) => {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft login not enabled");
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(CALENDAR_STATE_COOKIE_NAME)?.value;

  // We'll set the proper redirect URL after we decode the state and get emailAccountId
  const redirectUrl = new URL("/calendars", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.delete(CALENDAR_STATE_COOKIE_NAME);

  if (!code) {
    logger.warn("Missing code in Microsoft Calendar callback");
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during Microsoft Calendar callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  let decodedState: { emailAccountId: string; type: string; nonce: string };
  try {
    decodedState = parseOAuthState(storedState);
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  const { emailAccountId } = decodedState;

  // Verify the user has access to this emailAccountId
  const session = await auth();
  const emailAccount = await prisma.emailAccount.findFirst({
    where: {
      id: emailAccountId,
      user: {
        id: session?.user?.id,
      },
    },
  });

  if (!emailAccount) {
    logger.warn("User does not have access to email account", {
      emailAccountId,
    });
    redirectUrl.searchParams.set("error", "unauthorized");
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
          client_id: env.MICROSOFT_CLIENT_ID,
          client_secret: env.MICROSOFT_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/calendar/callback`,
        }),
      },
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(
        tokens.error_description || "Failed to exchange code for tokens",
      );
    }

    // Get user profile using the access token
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new Error("Failed to fetch user profile");
    }

    const profile = await profileResponse.json();
    const microsoftEmail = profile.mail || profile.userPrincipalName;

    if (!microsoftEmail) {
      throw new Error("Profile missing required email");
    }

    const existingConnection = await prisma.calendarConnection.findFirst({
      where: {
        emailAccountId,
        provider: "microsoft",
        email: microsoftEmail,
      },
    });

    if (existingConnection) {
      logger.info("Calendar connection already exists", {
        emailAccountId,
        microsoftEmail,
      });
      redirectUrl.searchParams.set("message", "calendar_already_connected");
      return NextResponse.redirect(redirectUrl, { headers: response.headers });
    }

    const connection = await prisma.calendarConnection.create({
      data: {
        provider: "microsoft",
        email: microsoftEmail,
        emailAccountId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        isConnected: true,
      },
    });

    await syncMicrosoftCalendars(
      connection.id,
      tokens.access_token,
      tokens.refresh_token,
      emailAccountId,
    );

    logger.info("Calendar connected successfully", {
      emailAccountId,
      microsoftEmail,
      connectionId: connection.id,
    });

    redirectUrl.searchParams.set("message", "calendar_connected");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  } catch (error) {
    logger.error("Error in Microsoft Calendar callback", {
      error,
      emailAccountId,
    });
    redirectUrl.searchParams.set("error", "calendar_connection_failed");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
});

async function syncMicrosoftCalendars(
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  emailAccountId: string,
) {
  try {
    const calendarClient = await getCalendarClientWithRefresh({
      accessToken,
      refreshToken,
      expiresAt: null,
      emailAccountId,
    });

    const microsoftCalendars = await fetchMicrosoftCalendars(calendarClient);

    for (const microsoftCalendar of microsoftCalendars) {
      if (!microsoftCalendar.id) continue;

      await prisma.calendar.upsert({
        where: {
          connectionId_calendarId: {
            connectionId,
            calendarId: microsoftCalendar.id,
          },
        },
        update: {
          name: microsoftCalendar.name || "Untitled Calendar",
          description: microsoftCalendar.description,
          timezone: microsoftCalendar.timeZone,
        },
        create: {
          connectionId,
          calendarId: microsoftCalendar.id,
          name: microsoftCalendar.name || "Untitled Calendar",
          description: microsoftCalendar.description,
          timezone: microsoftCalendar.timeZone,
          isEnabled: true,
        },
      });
    }
  } catch (error) {
    logger.error("Error syncing calendars", { error, connectionId });
    await prisma.calendarConnection.update({
      where: { id: connectionId },
      data: { isConnected: false },
    });
    throw error;
  }
}
