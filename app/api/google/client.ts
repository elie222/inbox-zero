import { google } from "googleapis";

const _global = global as any;

if (!_global.oauth2Client) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost:3000/api/google/callback"
  );
  _global.oauth2Client = oauth2Client;
}

export const client = _global.oauth2Client;

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];
