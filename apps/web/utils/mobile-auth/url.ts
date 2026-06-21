import { env } from "@/env";

export const MOBILE_AUTH_WEB_CALLBACK_PATH = "/api/mobile-auth/callback";
export const MOBILE_AUTH_APP_CALLBACK_PATH = "/auth-callback";

export type MobileAuthReturnUrlMode = "app-link" | "custom-scheme";

export function getMobileAuthWebCallbackUrl(state: string): string {
  const callbackUrl = new URL(
    MOBILE_AUTH_WEB_CALLBACK_PATH,
    getMobileAuthBaseUrlOrigin(),
  );
  callbackUrl.searchParams.set("state", state);
  return callbackUrl.toString();
}

export function getMobileAuthAppCallbackUrl(
  returnUrlMode?: MobileAuthReturnUrlMode,
): URL {
  if (returnUrlMode === "custom-scheme") {
    return new URL(getMobileAuthCustomSchemeOrigin());
  }

  const baseUrl = new URL(env.NEXT_PUBLIC_BASE_URL);
  if (baseUrl.protocol !== "https:" && env.MOBILE_AUTH_ORIGIN) {
    return new URL(getMobileAuthCustomSchemeOrigin());
  }

  return new URL(MOBILE_AUTH_APP_CALLBACK_PATH, baseUrl.origin);
}

export function getMobileAuthBaseUrlOrigin(): string {
  return new URL(env.NEXT_PUBLIC_BASE_URL).origin;
}

function getMobileAuthCustomSchemeOrigin(): string {
  const mobileAuthOrigin = env.MOBILE_AUTH_ORIGIN;
  if (!mobileAuthOrigin) {
    throw new Error("MOBILE_AUTH_ORIGIN is required for mobile custom scheme");
  }

  const origin = mobileAuthOrigin.endsWith("://")
    ? mobileAuthOrigin
    : `${mobileAuthOrigin.replace(/\/+$/u, "")}/`;
  return `${origin}${MOBILE_AUTH_APP_CALLBACK_PATH.slice(1)}`;
}
