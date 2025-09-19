import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { CALENDAR_SCOPES as GOOGLE_CALENDAR_SCOPES } from "@/utils/gmail/scopes";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("calendar/client");

type AuthOptions = {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
};

const getAuth = ({ accessToken, refreshToken, expiresAt }: AuthOptions) => {
  const googleAuth = new auth.OAuth2({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });
  googleAuth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiresAt,
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
  });

  return googleAuth;
};

export function getCalendarOAuth2Client() {
  return new auth.OAuth2({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${env.NEXT_PUBLIC_BASE_URL}/api/google/calendar/callback`,
  });
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
}): Promise<calendar_v3.Calendar> => {
  if (!refreshToken) throw new SafeError("No refresh token");

  // Check if token is still valid
  if (expiresAt && expiresAt > Date.now()) {
    const auth = getAuth({ accessToken, refreshToken, expiresAt });
    return calendar({ version: "v3", auth });
  }

  // Token is expired or missing, need to refresh
  const auth = getAuth({ accessToken, refreshToken });
  const cal = calendar({ version: "v3", auth });

  // may throw `invalid_grant` error
  try {
    const tokens = await auth.refreshAccessToken();
    const newAccessToken = tokens.credentials.access_token;
    const newExpiresAt = tokens.credentials.expiry_date ?? undefined;
    const newRefreshToken = tokens.credentials.refresh_token ?? undefined;

    // Find the calendar connection to update
    const calendarConnection = await prisma.calendarConnection.findFirst({
      where: {
        emailAccountId,
        provider: "google",
      },
      select: { id: true },
    });

    if (calendarConnection) {
      await saveCalendarTokens({
        tokens: {
          access_token: newAccessToken ?? undefined,
          refresh_token: newRefreshToken,
          expires_at: newExpiresAt,
        },
        connectionId: calendarConnection.id,
      });
    } else {
      logger.warn("No calendar connection found to update tokens", {
        emailAccountId,
      });
    }

    return cal;
  } catch (error) {
    const isInvalidGrantError =
      error instanceof Error && error.message.includes("invalid_grant");

    if (isInvalidGrantError) {
      logger.warn("Error refreshing Calendar access token", {
        emailAccountId,
        error: error.message,
        errorDescription: (
          error as Error & {
            response?: { data?: { error_description?: string } };
          }
        ).response?.data?.error_description,
      });
    }

    throw error;
  }
};

export async function fetchGoogleCalendars(
  calendarClient: calendar_v3.Calendar,
) {
  try {
    const response = await calendarClient.calendarList.list();
    return response.data.items || [];
  } catch (error) {
    logger.error("Error fetching Google calendars", { error });
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
    expires_at?: number; // milliseconds
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
        expiresAt: tokens.expires_at ? new Date(tokens.expires_at) : null,
      },
    });

    logger.info("Calendar tokens saved successfully", { connectionId });
  } catch (error) {
    logger.error("Failed to save calendar tokens", { error, connectionId });
    throw error;
  }
}
