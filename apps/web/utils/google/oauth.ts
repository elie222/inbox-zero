import { env } from "@/env";
import { z } from "zod";

const GOOGLE_DISCOVERY_URL =
  "https://accounts.google.com/.well-known/openid-configuration";
const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_API_ROOT_URL = "https://www.googleapis.com/";
const GOOGLE_GMAIL_API_ROOT_URL = "https://gmail.googleapis.com/";
const GOOGLE_GMAIL_BATCH_URL = "https://gmail.googleapis.com/batch/gmail/v1";
const GOOGLE_PEOPLE_API_ROOT_URL = "https://people.googleapis.com/";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_INFO_URL = "https://www.googleapis.com/oauth2/v1/tokeninfo";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const googleOpenIdProfileSchema = z.object({
  email: z.string().min(1),
  email_verified: z.boolean().optional(),
  family_name: z.string().optional(),
  given_name: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().nullish(),
  sub: z.string().min(1),
});

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

export function getGoogleOauthClientOptions(redirectUri?: string) {
  const baseUrl = getGoogleOauthBaseUrl();

  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri,
    ...(baseUrl && {
      endpoints: {
        oauth2AuthBaseUrl: `${baseUrl}/o/oauth2/v2/auth`,
        oauth2TokenUrl: getGoogleOauthTokenUrl(),
        oauth2RevokeUrl: `${baseUrl}/oauth2/revoke`,
      },
      issuers: [baseUrl],
    }),
  };
}

export function getGoogleApiRootUrl() {
  return getGoogleApiBaseUrl() || GOOGLE_API_ROOT_URL;
}

export function getGoogleGmailApiRootUrl() {
  return getGoogleApiBaseUrl() || GOOGLE_GMAIL_API_ROOT_URL;
}

export function getGoogleGmailBatchUrl() {
  const baseUrl = getGoogleApiBaseUrl();
  return baseUrl ? `${baseUrl}/batch/gmail/v1` : GOOGLE_GMAIL_BATCH_URL;
}

export function getGooglePeopleApiRootUrl() {
  return getGoogleApiBaseUrl() || GOOGLE_PEOPLE_API_ROOT_URL;
}

export function getGoogleTokenInfoUrl(accessToken: string) {
  const url = new URL(
    getGoogleApiBaseUrl()
      ? `${getGoogleApiBaseUrl()}/oauth2/v1/tokeninfo`
      : GOOGLE_TOKEN_INFO_URL,
  );
  url.searchParams.set("access_token", accessToken);
  return url.toString();
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

  const profileResult = googleOpenIdProfileSchema.safeParse(
    await response.json(),
  );
  if (!profileResult.success) {
    throw new Error(
      `Invalid Google profile response: ${profileResult.error.message}`,
    );
  }

  return profileResult.data;
}

function getGoogleOauthUserInfoUrl() {
  const baseUrl = getGoogleOauthBaseUrl();
  return baseUrl ? `${baseUrl}/oauth2/v2/userinfo` : GOOGLE_USERINFO_URL;
}

function getGoogleOauthBaseUrl() {
  return env.GOOGLE_BASE_URL?.replace(/\/+$/, "") || null;
}

function getGoogleApiBaseUrl() {
  return env.GOOGLE_BASE_URL?.replace(/\/+$/, "") || null;
}
