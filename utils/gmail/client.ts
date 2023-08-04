import { google } from "googleapis";
import { saveRefreshToken } from "@/utils/auth";

type ClientOptions = {
  accessToken?: string;
};

const getClient = (session: ClientOptions & { refreshToken?: string }) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const auth = new google.auth.OAuth2({ clientId, clientSecret });
  // not passing refresh_token when next-auth handles it
  auth.setCredentials({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });

  return auth;
};

export const getGmailClient = (session: ClientOptions) => {
  const auth = getClient(session);
  const gmail = google.gmail({ version: "v1", auth });

  return gmail;
};

export const getGmailClientWithRefresh = async (
  session: ClientOptions & { refreshToken: string; expiryDate?: number | null },
  providerAccountId: string
) => {
  const auth = getClient(session);
  const gmail = google.gmail({ version: "v1", auth });

  if (session.expiryDate && session.expiryDate > Date.now()) return gmail;

  const tokens = await auth.refreshAccessToken();

  if (tokens.credentials.access_token !== session.accessToken) {
    await saveRefreshToken(
      {
        access_token: tokens.credentials.access_token ?? undefined,
        expires_at: tokens.credentials.expiry_date
          ? Math.floor(tokens.credentials.expiry_date / 1000)
          : undefined,
      },
      {
        refresh_token: session.refreshToken,
        providerAccountId,
      }
    );
  }

  return gmail;
};
