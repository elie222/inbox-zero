import { env } from "@/env";

export function isTeamsOAuthConfigured(): boolean {
  return Boolean(getTeamsClientId() && getTeamsClientSecret());
}

export function getTeamsClientId(): string | null {
  return env.TEAMS_CLIENT_ID ?? env.MICROSOFT_CLIENT_ID ?? null;
}

export function getTeamsClientSecret(): string | null {
  return env.TEAMS_CLIENT_SECRET ?? env.MICROSOFT_CLIENT_SECRET ?? null;
}

export function getTeamsOAuthCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = getTeamsClientId();
  const clientSecret = getTeamsClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("Teams integration not configured");
  }

  return { clientId, clientSecret };
}

export function getTeamsOAuthBaseUrl(): string {
  return `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0`;
}

export function getTeamsRedirectUri(path = "/api/teams/callback"): string {
  const baseUrl = env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL;
  return `${baseUrl}${path}`;
}
