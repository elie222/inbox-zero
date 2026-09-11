import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import {
  getMicrosoftGraphClientOptions,
  getMicrosoftOauthAuthorizeUrl,
  requestMicrosoftToken,
} from "@/utils/microsoft/oauth";
import { CALENDAR_SCOPES } from "@/utils/outlook/scopes";
import { isInvalidGrantError, SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { saveCalendarTokens } from "@/utils/calendar/save-calendar-tokens";
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
      throw new Error(
        [tokens.error, tokens.error_description].filter(Boolean).join(": ") ||
          "Failed to refresh token",
      );
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
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: new Date(Date.now() + Number(tokens.expires_in) * 1000),
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
    if (isInvalidGrantError(error)) {
      logger.warn("Microsoft calendar authorization expired");
      try {
        // Tokens are encrypted at rest, so compare the decrypted values before
        // guarding the write against a concurrent refresh or reconnect.
        const connections = await prisma.calendarConnection.findMany({
          where: { emailAccountId, provider: "microsoft", isConnected: true },
          select: {
            id: true,
            accessToken: true,
            refreshToken: true,
            updatedAt: true,
          },
        });
        for (const connection of connections) {
          if (
            connection.refreshToken !== refreshToken ||
            connection.accessToken !== (accessToken ?? null)
          )
            continue;

          await prisma.calendarConnection.updateMany({
            where: {
              id: connection.id,
              updatedAt: connection.updatedAt,
              isConnected: true,
            },
            data: { isConnected: false },
          });
        }
      } catch (disconnectError) {
        logger.error("Failed to mark Microsoft calendar disconnected", {
          error: disconnectError,
        });
      }
      throw new SafeError(
        "Your Microsoft calendar authorization has expired. Please reconnect your calendar.",
      );
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
