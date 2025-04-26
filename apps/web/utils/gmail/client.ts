import { auth, gmail, type gmail_v1 } from "@googleapis/gmail";
import { people } from "@googleapis/people";
import { saveRefreshToken } from "@/utils/auth";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { SCOPES } from "@/utils/gmail/scopes";

const logger = createScopedLogger("gmail/client");

type AuthOptions = {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
};

const getAuth = ({ accessToken, refreshToken, expiryDate }: AuthOptions) => {
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

export const getGmailClient = (options: AuthOptions) => {
  const auth = getAuth(options);
  return gmail({ version: "v1", auth });
};

export const getContactsClient = (session: AuthOptions) => {
  const auth = getAuth(session);
  const contacts = people({ version: "v1", auth });

  return contacts;
};

export const getGmailAccessToken = async (options: AuthOptions) => {
  const auth = getAuth(options);
  return auth.getAccessToken();
};

export const getAccessTokenFromClient = (client: gmail_v1.Gmail): string => {
  const accessToken = (client.context._options.auth as any).credentials
    .access_token;
  if (!accessToken) throw new Error("No access token");
  return accessToken;
};

export const getGmailClientWithRefresh = async (
  options: AuthOptions & { refreshToken: string; expiryDate?: number | null },
  providerAccountId: string,
): Promise<gmail_v1.Gmail | undefined> => {
  const auth = getAuth(options);
  const g = gmail({ version: "v1", auth });

  if (options.expiryDate && options.expiryDate > Date.now()) return g;

  // may throw `invalid_grant` error
  try {
    const tokens = await auth.refreshAccessToken();
    const newAccessToken = tokens.credentials.access_token;

    if (newAccessToken !== options.accessToken) {
      await saveRefreshToken(
        {
          access_token: newAccessToken ?? undefined,
          expires_at: tokens.credentials.expiry_date
            ? Math.floor(tokens.credentials.expiry_date / 1000)
            : undefined,
        },
        {
          refresh_token: options.refreshToken,
          providerAccountId,
        },
      );
    }

    return g;
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Error refreshing Gmail access token", { error });
      return undefined;
    }

    throw error;
  }
};
