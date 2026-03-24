import { env } from "@/env";
import { z } from "zod";

const googleOpenIdProfileSchema = z.object({
  email: z.string().min(1),
  email_verified: z.boolean().optional(),
  family_name: z.string().optional(),
  given_name: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().nullish(),
  sub: z.string().min(1),
});

type GoogleOpenIdProfile = z.infer<typeof googleOpenIdProfileSchema>;

export function isGoogleOauthEmulationEnabled() {
  return !!getGoogleBaseUrl();
}

export function getGoogleOauthDiscoveryUrl() {
  const baseUrl = getGoogleBaseUrl();
  return baseUrl
    ? `${baseUrl}/.well-known/openid-configuration`
    : "https://accounts.google.com/.well-known/openid-configuration";
}

export function getGoogleOauthIssuer() {
  return getGoogleBaseUrl() || "https://accounts.google.com";
}

export function getGoogleOauthTokenUrl() {
  const baseUrl = getGoogleBaseUrl();
  return baseUrl
    ? `${baseUrl}/oauth2/token`
    : "https://oauth2.googleapis.com/token";
}

export function getGoogleOauthUserInfoUrl() {
  const baseUrl = getGoogleBaseUrl();
  return baseUrl
    ? `${baseUrl}/oauth2/v2/userinfo`
    : "https://openidconnect.googleapis.com/v1/userinfo";
}

export function getGoogleOauthClientOptions(redirectUri?: string) {
  const baseUrl = getGoogleBaseUrl();

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

export function getGoogleApiRootUrl() {
  return getExplicitGoogleBaseUrl() || "https://www.googleapis.com/";
}

export function getGoogleGmailApiRootUrl() {
  return getExplicitGoogleBaseUrl() || "https://gmail.googleapis.com/";
}

export function getGoogleGmailBatchUrl() {
  const baseUrl = getExplicitGoogleBaseUrl();
  return baseUrl
    ? `${baseUrl}/batch/gmail/v1`
    : "https://gmail.googleapis.com/batch/gmail/v1";
}

export function getGooglePeopleApiRootUrl() {
  return getExplicitGoogleBaseUrl() || "https://people.googleapis.com/";
}

export function getGoogleTokenInfoUrl(accessToken: string) {
  const baseUrl = getExplicitGoogleBaseUrl();
  const url = new URL(
    baseUrl
      ? `${baseUrl}/oauth2/v1/tokeninfo`
      : "https://www.googleapis.com/oauth2/v1/tokeninfo",
  );
  url.searchParams.set("access_token", accessToken);
  return url.toString();
}

export async function fetchGoogleOpenIdProfile(
  accessToken: string,
): Promise<GoogleOpenIdProfile> {
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

function getGoogleBaseUrl() {
  return env.GOOGLE_BASE_URL || env.GOOGLE_OAUTH_BASE_URL || null;
}

function getExplicitGoogleBaseUrl() {
  return env.GOOGLE_BASE_URL || null;
}
