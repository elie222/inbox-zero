import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { CALENDAR_SCOPES } from "@/utils/outlook/scopes";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import {
  Client,
  type AuthenticationProvider,
} from "@microsoft/microsoft-graph-client";

const logger = createScopedLogger("outlook/calendar-client");

class CalendarAuthProvider implements AuthenticationProvider {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }
}

export function getCalendarOAuth2Url(state: string): string {
  if (!env.MICROSOFT_CLIENT_ID) {
    throw new Error("Microsoft login not enabled - missing client ID");
  }

  const baseUrl =
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/calendar/callback`,
    scope: CALENDAR_SCOPES.join(" "),
    state,
    prompt: "consent",
  });

  return `${baseUrl}?${params.toString()}`;
}

export const getCalendarClientWithRefresh = async ({
  accessToken,
  refreshToken,
  expiresAt,
  emailAccountId,
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
}): Promise<Client> => {
  if (!refreshToken) throw new SafeError("No refresh token");

  // Check if token is still valid
  if (expiresAt && expiresAt > Date.now()) {
    const authProvider = new CalendarAuthProvider(accessToken || "");
    return Client.initWithMiddleware({ authProvider });
  }

  // Token is expired or missing, need to refresh
  try {
    if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
      throw new Error("Microsoft login not enabled - missing credentials");
    }

    const response = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: env.MICROSOFT_CLIENT_ID,
          client_secret: env.MICROSOFT_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: CALENDAR_SCOPES.join(" "),
        }),
      },
    );

    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(tokens.error_description || "Failed to refresh token");
    }

    // Find the calendar connection to update
    const calendarConnection = await prisma.calendarConnection.findFirst({
      where: {
        emailAccountId,
        provider: "microsoft",
      },
      select: { id: true },
    });

    if (calendarConnection) {
      await saveCalendarTokens({
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
        },
        connectionId: calendarConnection.id,
      });
    } else {
      logger.warn("No calendar connection found to update tokens", {
        emailAccountId,
      });
    }

    const authProvider = new CalendarAuthProvider(tokens.access_token);
    return Client.initWithMiddleware({ authProvider });
  } catch (error) {
    const isInvalidGrantError =
      error instanceof Error && error.message.includes("invalid_grant");

    if (isInvalidGrantError) {
      logger.warn("Error refreshing Calendar access token", {
        emailAccountId,
        error: error.message,
      });
    }

    throw error;
  }
};

export async function fetchMicrosoftCalendars(calendarClient: Client): Promise<
  Array<{
    id?: string;
    name?: string;
    description?: string;
    timeZone?: string;
  }>
> {
  try {
    const response = await calendarClient.api("/me/calendars").get();

    return response.value || [];
  } catch (error) {
    logger.error("Error fetching Microsoft calendars", { error });
    throw new SafeError("Failed to fetch calendars");
  }
}

async function saveCalendarTokens({
  tokens,
  connectionId,
}: {
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number; // seconds
  };
  connectionId: string;
}) {
  if (!tokens.access_token) {
    logger.warn("No access token to save for calendar connection", {
      connectionId,
    });
    return;
  }

  try {
    await prisma.calendarConnection.update({
      where: { id: connectionId },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_at
          ? new Date(tokens.expires_at * 1000)
          : null,
      },
    });

    logger.info("Calendar tokens saved successfully", { connectionId });
  } catch (error) {
    logger.error("Failed to save calendar tokens", { error, connectionId });
    throw error;
  }
}
