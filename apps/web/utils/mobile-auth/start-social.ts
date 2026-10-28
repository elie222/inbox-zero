import type { z } from "zod";
import type { mobileAuthProviderSchema } from "@/utils/mobile-auth/providers";
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

export type StartedMobileSocialAuth = {
  authorizationURL: string;
  authSessionReturnUrl: string;
  oauthState: string;
  state: string;
  setCookies: string[];
};

export async function startMobileSocialAuth(input: {
  provider: z.infer<typeof mobileAuthProviderSchema>;
  codeChallenge: string;
  returnUrlMode: MobileAuthReturnUrlMode;
}): Promise<StartedMobileSocialAuth> {
  const state = createMobileAuthState();
  const authSessionReturnUrl = getMobileAuthAppCallbackUrl(
    input.returnUrlMode,
  ).toString();
  const completionToken = createMobileAuthState();
  const errorCallbackUrl = getMobileAuthWebCallbackUrl(state);
  // Kept inside Better Auth's protected OAuth state until provider completion.
  const callbackUrl = new URL(errorCallbackUrl);
  callbackUrl.searchParams.set("completion", completionToken);
  const webCallbackUrl = callbackUrl.toString();

  const signInPath = "/api/auth/sign-in/social";
  const signInPayload = {
    provider: input.provider,
    callbackURL: webCallbackUrl,
    errorCallbackURL: errorCallbackUrl,
    newUserCallbackURL: webCallbackUrl,
    disableRedirect: true,
  };

  const signInResponse = await betterAuthConfig.handler(
    new Request(new URL(signInPath, getMobileAuthBaseUrlOrigin()), {
      body: JSON.stringify(signInPayload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
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
    codeChallenge: input.codeChallenge,
    provider: input.provider,
    completionToken,
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
