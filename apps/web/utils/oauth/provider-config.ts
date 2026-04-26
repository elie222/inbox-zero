import { env } from "@/env";

function isConfiguredValue(value: string | undefined) {
  if (!value) return false;

  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "skipped") return false;
  if (trimmed.startsWith("your-")) return false;

  return true;
}

export function hasGoogleOauthConfig() {
  return (
    isConfiguredValue(env.GOOGLE_CLIENT_ID) &&
    isConfiguredValue(env.GOOGLE_CLIENT_SECRET)
  );
}

export function hasMicrosoftOauthConfig() {
  return (
    isConfiguredValue(env.MICROSOFT_CLIENT_ID) &&
    isConfiguredValue(env.MICROSOFT_CLIENT_SECRET)
  );
}

export function hasAppleOauthConfig() {
  return (
    isConfiguredValue(env.APPLE_CLIENT_ID) &&
    isConfiguredValue(env.APPLE_TEAM_ID) &&
    isConfiguredValue(env.APPLE_KEY_ID) &&
    isConfiguredValue(env.APPLE_PRIVATE_KEY) &&
    isConfiguredValue(env.APPLE_APP_BUNDLE_IDENTIFIER)
  );
}

export function isConfiguredOauthValue(value: string | undefined) {
  return isConfiguredValue(value);
}
