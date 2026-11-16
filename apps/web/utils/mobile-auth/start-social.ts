import type { z } from "zod";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import {
  createMobileAuthState,
  storeMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";
import type { mobileAuthProviderSchema } from "@/utils/mobile-auth/providers";
import { MobileSocialAuthRateLimitError } from "@/utils/mobile-auth/rate-limit-error";
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

const logger = createScopedLogger("mobile-auth/start-social");

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
  if (signInResponse.status === 429) {
    logger.warn("Mobile social sign-in rate limited", {
      provider: input.provider,
      status: signInResponse.status,
    });
    throw new MobileSocialAuthRateLimitError(
      signInResponse.headers.get("Retry-After") ??
        signInResponse.headers.get("X-Retry-After"),
    );
  }

  const signInBody = (await signInResponse.json().catch(() => null)) as {
    url?: string;
  } | null;
  const oauthState = getOAuthStateCookieValue(signInResponse.headers);

  if (!signInResponse.ok || !signInBody?.url || !oauthState) {
    // Record response structure without logging upstream body contents.
    logger.error("Failed to start mobile social sign-in", {
      provider: input.provider,
      status: signInResponse.status,
      hasUrl: Boolean(signInBody?.url),
      hasOAuthState: Boolean(oauthState),
    });
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
