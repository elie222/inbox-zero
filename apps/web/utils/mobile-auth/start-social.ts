import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import {
  createMobileAuthState,
  storeMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";
import {
  getOAuthStateCookieValue,
  getSetCookieValues,
} from "@/utils/mobile-auth/set-cookie";
import {
  getMobileAuthAppCallbackUrl,
  getMobileAuthBaseUrlOrigin,
  getMobileAuthWebCallbackUrl,
  type MobileAuthReturnUrlMode,
} from "@/utils/mobile-auth/url";

export const MOBILE_AUTH_PROVIDERS = ["apple", "google", "microsoft"] as const;
export type MobileAuthProvider = (typeof MOBILE_AUTH_PROVIDERS)[number];

export type StartedMobileSocialAuth = {
  authorizationURL: string;
  authSessionReturnUrl: string;
  oauthState: string;
  state: string;
  setCookies: string[];
};

export async function startMobileSocialAuth(input: {
  provider: MobileAuthProvider;
  returnUrlMode: MobileAuthReturnUrlMode;
}): Promise<StartedMobileSocialAuth> {
  const state = createMobileAuthState();
  const authSessionReturnUrl = getMobileAuthAppCallbackUrl(
    input.returnUrlMode,
  ).toString();
  const webCallbackUrl = getMobileAuthWebCallbackUrl(state);

  const signInResponse = await betterAuthConfig.handler(
    new Request(
      new URL("/api/auth/sign-in/social", getMobileAuthBaseUrlOrigin()),
      {
        body: JSON.stringify({
          provider: input.provider,
          callbackURL: webCallbackUrl,
          errorCallbackURL: webCallbackUrl,
          newUserCallbackURL: webCallbackUrl,
          disableRedirect: true,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    ),
  );
  const signInBody = (await signInResponse.json().catch(() => null)) as {
    url?: string;
  } | null;
  const oauthState = getOAuthStateCookieValue(signInResponse.headers);

  if (!signInResponse.ok || !signInBody?.url || !oauthState) {
    throw new SafeError("Failed to start authentication", 500);
  }

  assertHttpAuthorizationUrl(signInBody.url);

  await storeMobileAuthState({
    returnUrlMode: input.returnUrlMode,
    state,
  });

  return {
    authorizationURL: signInBody.url,
    authSessionReturnUrl,
    oauthState,
    setCookies: getSetCookieValues(signInResponse.headers),
    state,
  };
}

function assertHttpAuthorizationUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SafeError("Failed to start authentication", 500);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SafeError("Failed to start authentication", 500);
  }
}
