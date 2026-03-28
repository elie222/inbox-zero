import { auth } from "@googleapis/drive";
import { env } from "@/env";
import {
  fetchGoogleOpenIdProfile,
  getGoogleOauthClientOptions,
  isGoogleOauthEmulationEnabled,
} from "@/utils/google/oauth";
import {
  getMicrosoftGraphUrl,
  getMicrosoftOauthAuthorizeUrl,
  requestMicrosoftToken,
} from "@/utils/microsoft/oauth";
import {
  GOOGLE_DRIVE_FULL_SCOPES,
  GOOGLE_DRIVE_SCOPES,
  MICROSOFT_DRIVE_SCOPES,
} from "./scopes";

// ============================================================================
// Google Drive OAuth
// ============================================================================

/**
 * Creates an OAuth2 client for Google Drive authentication
 */
export function getGoogleDriveOAuth2Client() {
  return new auth.OAuth2(
    getGoogleOauthClientOptions(
      `${env.NEXT_PUBLIC_BASE_URL}/api/google/drive/callback`,
    ),
  );
}

/**
 * Generates the OAuth2 URL for Google Drive
 */
export type GoogleDriveAccessLevel = "limited" | "full";

export function getGoogleDriveOAuth2Url(
  state: string,
  accessLevel: GoogleDriveAccessLevel = "limited",
): string {
  const oauth2Client = getGoogleDriveOAuth2Client();
  const scopes =
    accessLevel === "full" ? GOOGLE_DRIVE_FULL_SCOPES : GOOGLE_DRIVE_SCOPES;
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [...scopes],
    state,
    prompt: "consent",
  });
}

/**
 * Exchange Google OAuth code for tokens
 */
export async function exchangeGoogleDriveCode(code: string) {
  const oauth2Client = getGoogleDriveOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("No access or refresh token returned from Google");
  }

  const profile = isGoogleOauthEmulationEnabled()
    ? await fetchGoogleOpenIdProfile(tokens.access_token)
    : await verifyGoogleIdTokenPayload(oauth2Client, tokens.id_token);
  const email = profile.email;

  if (!email) {
    throw new Error("Could not get email from Google profile");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    email,
  };
}

async function verifyGoogleIdTokenPayload(
  oauth2Client: ReturnType<typeof getGoogleDriveOAuth2Client>,
  idToken: string | null | undefined,
) {
  if (!idToken) {
    throw new Error("No ID token returned from Google");
  }

  const ticket = await oauth2Client.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.email) {
    throw new Error("Could not get email from Google ID token");
  }

  return payload;
}

// ============================================================================
// Microsoft OneDrive OAuth
// ============================================================================

/**
 * Generates the OAuth2 URL for Microsoft OneDrive/SharePoint
 */
export function getMicrosoftDriveOAuth2Url(state: string): string {
  if (!env.MICROSOFT_CLIENT_ID) {
    throw new Error("Microsoft login not enabled - missing client ID");
  }

  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/drive/callback`,
    scope: MICROSOFT_DRIVE_SCOPES.join(" "),
    prompt: "consent", // Ensures refresh token is returned on re-auth
    state,
  });

  return `${getMicrosoftOauthAuthorizeUrl()}?${params.toString()}`;
}

/**
 * Exchange Microsoft OAuth code for tokens
 */
export async function exchangeMicrosoftDriveCode(code: string) {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft login not enabled - missing credentials");
  }

  const response = await requestMicrosoftToken({
    client_id: env.MICROSOFT_CLIENT_ID,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    code,
    redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/drive/callback`,
    grant_type: "authorization_code",
    scope: MICROSOFT_DRIVE_SCOPES.join(" "),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error_description || "Failed to exchange code");
  }

  const tokens = await response.json();

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("No access or refresh token returned from Microsoft");
  }

  // Get user email from Microsoft Graph
  const profileResponse = await fetch(getMicrosoftGraphUrl("/me"), {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });

  if (!profileResponse.ok) {
    throw new Error("Failed to get user profile from Microsoft");
  }

  const profile = await profileResponse.json();
  const email = profile.mail || profile.userPrincipalName;

  if (!email) {
    throw new Error("Could not get email from Microsoft profile");
  }

  return {
    accessToken: tokens.access_token as string,
    refreshToken: tokens.refresh_token as string,
    expiresAt: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null,
    email: email as string,
  };
}
