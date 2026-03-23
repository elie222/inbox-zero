import { env } from "@/env";

const GOOGLE_DISCOVERY_URL =
  "https://accounts.google.com/.well-known/openid-configuration";
const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export type GoogleOpenIdProfile = {
  email: string;
  email_verified?: boolean;
  family_name?: string;
  given_name?: string;
  name?: string;
  picture?: string;
  sub: string;
};

const googleOauthBaseUrl =
  env.GOOGLE_OAUTH_BASE_URL?.replace(/\/+$/, "") || null;

function getGoogleOauthBaseUrl() {
  return googleOauthBaseUrl;
}

export function isGoogleOauthEmulationEnabled() {
  return !!getGoogleOauthBaseUrl();
}

export function getGoogleOauthDiscoveryUrl() {
  const baseUrl = getGoogleOauthBaseUrl();
  return baseUrl
    ? `${baseUrl}/.well-known/openid-configuration`
    : GOOGLE_DISCOVERY_URL;
}

export function getGoogleOauthIssuer() {
  return getGoogleOauthBaseUrl() || GOOGLE_ISSUER;
}

export function getGoogleOauthTokenUrl() {
  const baseUrl = getGoogleOauthBaseUrl();
  return baseUrl ? `${baseUrl}/oauth2/token` : GOOGLE_TOKEN_URL;
}

export function getGoogleOauthUserInfoUrl() {
  const baseUrl = getGoogleOauthBaseUrl();
  return baseUrl ? `${baseUrl}/oauth2/v2/userinfo` : GOOGLE_USERINFO_URL;
}

export function getGoogleOauthClientOptions(redirectUri?: string) {
  const baseUrl = getGoogleOauthBaseUrl();

  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri,
    ...(baseUrl && {
      endpoints: {
        oauth2AuthBaseUrl: `${baseUrl}/o/oauth2/v2/auth`,
        oauth2TokenUrl: `${baseUrl}/oauth2/token`,
        oauth2RevokeUrl: `${baseUrl}/oauth2/revoke`,
      },
      issuers: [baseUrl],
    }),
  };
}

export async function fetchGoogleOpenIdProfile(accessToken: string) {
  const response = await fetch(getGoogleOauthUserInfoUrl(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google profile (${response.status})`);
  }

  const profile = (await response.json()) as Partial<GoogleOpenIdProfile>;

  if (!profile.sub || !profile.email) {
    throw new Error("Google profile response missing subject or email");
  }

  return profile as GoogleOpenIdProfile;
}
