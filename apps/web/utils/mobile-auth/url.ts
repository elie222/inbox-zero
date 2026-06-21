import { env } from "@/env";

export const MOBILE_AUTH_WEB_CALLBACK_PATH = "/api/mobile-auth/callback";
export const MOBILE_AUTH_APP_CALLBACK_PATH = "/auth-callback";

export function getMobileAuthWebCallbackUrl(state: string): string {
  const callbackUrl = new URL(
    MOBILE_AUTH_WEB_CALLBACK_PATH,
    getMobileAuthBaseUrlOrigin(),
  );
  callbackUrl.searchParams.set("state", state);
  return callbackUrl.toString();
}

export function getMobileAuthAppCallbackUrl(): URL {
  const baseUrl = new URL(env.NEXT_PUBLIC_BASE_URL);
  if (baseUrl.protocol !== "https:" && env.MOBILE_AUTH_ORIGIN) {
    const origin = env.MOBILE_AUTH_ORIGIN.endsWith("://")
      ? env.MOBILE_AUTH_ORIGIN
      : `${env.MOBILE_AUTH_ORIGIN.replace(/\/+$/u, "")}/`;
    return new URL(`${origin}${MOBILE_AUTH_APP_CALLBACK_PATH.slice(1)}`);
  }

  return new URL(MOBILE_AUTH_APP_CALLBACK_PATH, baseUrl.origin);
}

export function getMobileAuthBaseUrlOrigin(): string {
  return new URL(env.NEXT_PUBLIC_BASE_URL).origin;
}
