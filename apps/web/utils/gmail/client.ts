import { auth, gmail, type gmail_v1 } from "@googleapis/gmail";
import { people } from "@googleapis/people";
import { saveTokens } from "@/utils/auth";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { SCOPES } from "@/utils/gmail/scopes";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("gmail/client");

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
    scope: SCOPES.join(" "),
  });

  return googleAuth;
};

export function getLinkingOAuth2Client() {
  return new auth.OAuth2({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${env.NEXT_PUBLIC_BASE_URL}/api/google/linking/callback`,
  });
}

// we should potentially use this everywhere instead of getGmailClient as this handles refreshing the access token and saving it to the db
export const getGmailClientWithRefresh = async ({
  accessToken,
  refreshToken,
  expiresAt,
  emailAccountId,
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
}): Promise<gmail_v1.Gmail> => {
  if (!refreshToken) throw new SafeError("No refresh token");

  // we handle refresh ourselves so not passing in expiresAt
  const auth = getAuth({ accessToken, refreshToken });
  const g = gmail({ version: "v1", auth });

  // expiresAt is already in milliseconds (from .getTime())
  // Add buffer of 5 minutes (300000ms) to refresh token before it actually expires
  const now = Date.now();
  const shouldRefresh = !expiresAt || expiresAt <= now + 300_000;

  if (!shouldRefresh) {
    logger.info("Token still valid, skipping refresh", {
      emailAccountId,
      expiresAt,
      now,
      minutesRemaining: expiresAt
        ? Math.floor((expiresAt - now) / 60_000)
        : null,
    });
    return g;
  }

  logger.info("Token expired or expiring soon, refreshing", {
    emailAccountId,
    expiresAt,
    now,
    expired: expiresAt ? expiresAt <= now : true,
  });

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

    return g;
  } catch (error) {
    const isInvalidGrantError =
      error instanceof Error && error.message.includes("invalid_grant");

    if (isInvalidGrantError) {
      const errorData = (error as any).response?.data;
      logger.error("Gmail refresh token invalid or revoked", {
        emailAccountId,
        error: error.message,
        errorDescription: errorData?.error_description,
        errorDetails: errorData,
        hint: "User needs to re-authenticate with Google",
      });

      // Throw a more user-friendly error
      throw new SafeError(
        "Your Google account connection has expired. Please reconnect your account in settings.",
        401,
      );
    }

    logger.error("Unexpected error refreshing Gmail access token", {
      emailAccountId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};

// doesn't handle refreshing the access token
// should probably use the same auth object as getGmailClientWithRefresh but not critical for now
export const getContactsClient = ({
  accessToken,
  refreshToken,
}: AuthOptions) => {
  const auth = getAuth({ accessToken, refreshToken });
  const contacts = people({ version: "v1", auth });

  return contacts;
};

export const getAccessTokenFromClient = (client: gmail_v1.Gmail): string => {
  const accessToken = (client.context._options.auth as any).credentials
    .access_token;
  if (!accessToken) throw new Error("No access token");
  return accessToken;
};
