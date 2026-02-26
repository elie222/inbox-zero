import { env } from "@/env";

export const LOCAL_BYPASS_USER_EMAIL = "local-bypass@inboxzero.local";
export const LOCAL_BYPASS_USER_NAME = "Local Test User";
export const LOCAL_BYPASS_PROVIDER = "google";
export const LOCAL_BYPASS_PROVIDER_ACCOUNT_PREFIX = "local-bypass:";
export const LOCAL_BYPASS_ACCESS_TOKEN = "local-bypass-access-token";

export function isLocalAuthBypassEnabled() {
  return env.NODE_ENV === "development" && env.LOCAL_AUTH_BYPASS_ENABLED;
}

export function getLocalBypassProviderAccountId(userId: string) {
  return `${LOCAL_BYPASS_PROVIDER_ACCOUNT_PREFIX}${userId}`;
}

export function isLocalBypassProviderAccountId(
  providerAccountId: string | null | undefined,
) {
  return (
    !!providerAccountId &&
    providerAccountId.startsWith(LOCAL_BYPASS_PROVIDER_ACCOUNT_PREFIX)
  );
}

export function isLocalBypassUserEmail(email: string | null | undefined) {
  return email?.toLowerCase() === LOCAL_BYPASS_USER_EMAIL;
}
