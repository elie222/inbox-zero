import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
import { saveTokens } from "@/utils/auth";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { CALENDAR_SCOPES } from "@/utils/calendar/scopes";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("calendar/client");

type AuthOptions = {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
  expiresAt?: number | null;
};

const getAuth = ({
  accessToken,
  refreshToken,
  expiresAt,
  ...rest
}: AuthOptions) => {
  const expiryDate = expiresAt ? expiresAt : rest.expiryDate;

  const googleAuth = new auth.OAuth2({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });
  googleAuth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate,
    scope: CALENDAR_SCOPES.join(" "),
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

  // we handle refresh ourselves so not passing in expiresAt
  const auth = getAuth({ accessToken, refreshToken });
  const cal = calendar({ version: "v3", auth });

  const expiryDate = expiresAt ? expiresAt : null;
  if (expiryDate && expiryDate > Date.now()) return cal;

  // may throw `invalid_grant` error
  try {
    const tokens = await auth.refreshAccessToken();
    const newAccessToken = tokens.credentials.access_token;

    if (newAccessToken !== accessToken) {
      await saveTokens({
        tokens: {
          access_token: newAccessToken ?? undefined,
          expires_at: tokens.credentials.expiry_date
            ? Math.floor(tokens.credentials.expiry_date / 1000)
            : undefined,
        },
        accountRefreshToken: refreshToken,
        emailAccountId,
        provider: "google",
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
