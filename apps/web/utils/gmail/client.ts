import { auth, gmail, type gmail_v1 } from "@googleapis/gmail";
import { people } from "@googleapis/people";
import { saveTokens } from "@/utils/auth";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { SCOPES } from "@/utils/gmail/scopes";

// TODO: this file needs some clean up
// We're returning different clients and can run into situations with expired access tokens
// Ideally we refresh access token when needed and store the new access token in the db
// Also we shouldn't be instantiating multiple clients as they can hold different tokens, where we refresh the access token for one client but not for the other

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
  const expiryDate = expiresAt ? expiresAt * 1000 : rest.expiryDate;

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

// doesn't handle refreshing the access token
export const getContactsClient = ({
  accessToken,
  refreshToken,
}: AuthOptions) => {
  const auth = getAuth({ accessToken, refreshToken });
  const contacts = people({ version: "v1", auth });

  return contacts;
};

// handles refreshing the access token if expired at is passed in, but doesn't save the new access token to the db
export const getGmailAccessToken = async (options: AuthOptions) => {
  const auth = getAuth(options);
  const token = await auth.getAccessToken();
  const g = gmail({ version: "v1", auth });

  // TODO: save the new access token to the db
  // if (token.token && token.token !== options.accessToken) {
  //   await saveRefreshToken(
  //     {
  //       access_token: token.token,
  //       expires_at: token.res?.data.expires_at,
  //     },
  //     { refresh_token: options.refreshToken },
  //   );
  // }

  return { gmail: g, accessToken: token.token };
};

export const getAccessTokenFromClient = (client: gmail_v1.Gmail): string => {
  const accessToken = (client.context._options.auth as any).credentials
    .access_token;
  if (!accessToken) throw new Error("No access token");
  return accessToken;
};

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
  // we handle refresh ourselves so not passing in expiresAt
  const auth = getAuth({ accessToken, refreshToken });
  const g = gmail({ version: "v1", auth });

  const expiryDate = expiresAt ? expiresAt * 1000 : null;
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
      });
    }

    return g;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      logger.warn("Error refreshing Gmail access token", { error });
    }

    throw error;
  }
};

const isInvalidGrantError = (error: unknown) => {
  return error instanceof Error && error.message.includes("invalid_grant");
};
