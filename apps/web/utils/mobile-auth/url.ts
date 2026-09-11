import { env } from "@/env";

export const MOBILE_AUTH_WEB_CALLBACK_PATH = "/api/mobile-auth/callback";
export const MOBILE_AUTH_APP_CALLBACK_PATH = "/auth-callback";

export const MOBILE_AUTH_RETURN_URL_MODES = [
  "app-link",
  "custom-scheme",
  "desktop-scheme",
] as const;

export type MobileAuthReturnUrlMode =
  (typeof MOBILE_AUTH_RETURN_URL_MODES)[number];

export function isMobileAuthReturnUrlMode(
  value: string,
): value is MobileAuthReturnUrlMode {
  return (MOBILE_AUTH_RETURN_URL_MODES as readonly string[]).includes(value);
}

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
    return new URL(getCustomSchemeCallbackUrl("MOBILE_AUTH_ORIGIN"));
  }

  if (returnUrlMode === "desktop-scheme") {
    return new URL(getCustomSchemeCallbackUrl("DESKTOP_AUTH_ORIGIN"));
  }

  const baseUrl = new URL(env.NEXT_PUBLIC_BASE_URL);
  if (baseUrl.protocol !== "https:" && env.MOBILE_AUTH_ORIGIN) {
    return new URL(getCustomSchemeCallbackUrl("MOBILE_AUTH_ORIGIN"));
  }

  return new URL(MOBILE_AUTH_APP_CALLBACK_PATH, baseUrl.origin);
}

export function getMobileAuthBaseUrlOrigin(): string {
  return new URL(env.NEXT_PUBLIC_BASE_URL).origin;
}

function getCustomSchemeCallbackUrl(
  envName: "MOBILE_AUTH_ORIGIN" | "DESKTOP_AUTH_ORIGIN",
): string {
  const origin = env[envName];
  if (!origin) {
    throw new Error(`${envName} is required for this auth callback scheme`);
  }

  const normalized = origin.endsWith("://")
    ? origin
    : `${origin.replace(/\/+$/u, "")}/`;
  return `${normalized}${MOBILE_AUTH_APP_CALLBACK_PATH.slice(1)}`;
}
