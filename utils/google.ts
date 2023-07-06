import { google } from "googleapis";

export const getClient = (session: { accessToken: string, refreshToken: string }) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const accessToken = session.accessToken;
  const refreshToken = session.refreshToken;

  const auth = new google.auth.OAuth2({ clientId, clientSecret });
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

  return auth;
}