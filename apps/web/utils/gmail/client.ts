import { auth, gmail, type gmail_v1 } from "@googleapis/gmail";
import { people } from "@googleapis/people";
import { saveTokens } from "@/utils/auth/save-tokens";
import type { Logger } from "@/utils/logger";
import { SCOPES } from "@/utils/gmail/scopes";
import { SafeError } from "@/utils/error";
import { env } from "@/env";
import {
  getGoogleGmailApiRootUrl,
  getGoogleOauthClientOptions,
  getGooglePeopleApiRootUrl,
} from "@/utils/google/oauth";

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

  const googleAuth = new auth.OAuth2(getGoogleOauthClientOptions());
  googleAuth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate,
    scope: SCOPES.join(" "),
  });

  return googleAuth;
};

export function getLinkingOAuth2Client() {
  return new auth.OAuth2(
    getGoogleOauthClientOptions(
      `${env.NEXT_PUBLIC_BASE_URL}/api/google/linking/callback`,
    ),
  );
}

// we should potentially use this everywhere instead of getGmailClient as this handles refreshing the access token and saving it to the db
export const getGmailClientWithRefresh = async ({
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
}): Promise<gmail_v1.Gmail> => {
  if (!refreshToken) {
    logger.error("No refresh token", { emailAccountId });
    throw new SafeError("No refresh token");
  }

  // we handle refresh ourselves so not passing in expiresAt
  const auth = getAuth({ accessToken, refreshToken });
  const g = gmail({ version: "v1", auth, rootUrl: getGoogleGmailApiRootUrl() });

  const expiryDate = expiresAt ? expiresAt : null;
  if (expiryDate && expiryDate > Date.now()) return g;

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
        expectedExpiresAt: expiresAt,
      });
    }

    return g;
  } catch (error) {
    const isInvalidGrantError =
      error instanceof Error && error.message.includes("invalid_grant");

    if (isInvalidGrantError) {
      logger.warn("Error refreshing Gmail access token", {
        emailAccountId,
        error: error.message,
        // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
        errorDescription: (error as any).response?.data?.error_description,
      });
    }

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
  const contacts = people({
    version: "v1",
    auth,
    rootUrl: getGooglePeopleApiRootUrl(),
  });

  return contacts;
};

export const getAccessTokenFromClient = (client: gmail_v1.Gmail): string => {
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  const accessToken = (client.context._options.auth as any).credentials
    .access_token;
  if (!accessToken) throw new Error("No access token");
  return accessToken;
};
