import { google } from "googleapis";

type ClientOptions = {
  accessToken?: string;
};

const getClient = (session: ClientOptions) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const auth = new google.auth.OAuth2({ clientId, clientSecret });
  // not passing refresh_token as next-auth handles that
  auth.setCredentials({ access_token: session.accessToken });

  return auth;
};

export const getGmailClient = (session: ClientOptions) => {
  const auth = getClient(session);
  const gmail = google.gmail({ version: "v1", auth });

  return gmail;
};
