import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import {
  getMicrosoftGraphClientOptions,
  getMicrosoftOauthAuthorizeUrl,
  requestMicrosoftToken,
} from "@/utils/microsoft/oauth";
import { CALENDAR_SCOPES } from "@/utils/outlook/scopes";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import {
  Client,
  type AuthenticationProvider,
} from "@microsoft/microsoft-graph-client";

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

  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/calendar/callback`,
    scope: CALENDAR_SCOPES.join(" "),
    state,
  });

  return `${getMicrosoftOauthAuthorizeUrl()}?${params.toString()}`;
}

export const getCalendarClientWithRefresh = async ({
  accessToken,
  refreshToken,
  expiresAt,
  emailAccountId,
  logger,
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
  logger: Logger;
}): Promise<Client> => {
  if (!refreshToken) throw new SafeError("No refresh token");

  // Check if token is still valid
  if (expiresAt && expiresAt > Date.now() && accessToken) {
    const authProvider = new CalendarAuthProvider(accessToken);
    return Client.initWithMiddleware({
      authProvider,
      ...getMicrosoftGraphClientOptions(accessToken),
    });
  }

  // Token is expired or missing, need to refresh
  try {
    if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
      throw new Error("Microsoft login not enabled - missing credentials");
    }

    const response = await requestMicrosoftToken({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: CALENDAR_SCOPES.join(" "),
    });

    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(tokens.error_description || "Failed to refresh token");
    }

    if (!tokens.expires_in) {
      throw new Error("Token response missing expires_in field");
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
          expires_at: Math.floor(Date.now() / 1000 + Number(tokens.expires_in)),
        },
        connectionId: calendarConnection.id,
        expectedExpiresAt: expiresAt,
        logger,
      });
    } else {
      logger.warn("No calendar connection found to update tokens", {
        emailAccountId,
      });
    }

    const authProvider = new CalendarAuthProvider(tokens.access_token);
    return Client.initWithMiddleware({
      authProvider,
      ...getMicrosoftGraphClientOptions(tokens.access_token),
    });
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

export async function fetchMicrosoftCalendars(
  calendarClient: Client,
  logger: Logger,
): Promise<
  Array<{
    id?: string;
    name?: string;
    description?: string;
    isDefaultCalendar?: boolean;
  }>
> {
  try {
    const response = await calendarClient
      .api("/me/calendars")
      .select("id,name,color,isDefaultCalendar,canEdit,owner")
      .get();

    return response.value || [];
  } catch (error) {
    logger.error("Error fetching Microsoft calendars", { error });
    throw new SafeError("Failed to fetch calendars");
  }
}

async function saveCalendarTokens({
  tokens,
  connectionId,
  expectedExpiresAt,
  logger,
}: {
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number; // seconds
  };
  connectionId: string;
  expectedExpiresAt: number | null;
  logger: Logger;
}) {
  if (!tokens.access_token) {
    logger.warn("No access token to save for calendar connection", {
      connectionId,
    });
    return;
  }

  try {
    const result = await prisma.calendarConnection.updateMany({
      where: {
        id: connectionId,
        expiresAt: getExpectedExpiresAtWhere(expectedExpiresAt),
      },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_at
          ? new Date(tokens.expires_at * 1000)
          : null,
      },
    });

    if (result.count === 0) {
      logger.info("Skipped stale calendar token update", { connectionId });
      return { status: "conflict" as const };
    }

    logger.info("Calendar tokens saved successfully", { connectionId });
    return { status: "saved" as const };
  } catch (error) {
    logger.error("Failed to save calendar tokens", { error, connectionId });
    throw error;
  }
}

function getExpectedExpiresAtWhere(expectedExpiresAt: number | null) {
  if (!expectedExpiresAt) return null;

  return {
    gte: new Date(expectedExpiresAt),
    lt: new Date(expectedExpiresAt + 1),
  };
}
