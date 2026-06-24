import { NextResponse } from "next/server";
import { z } from "zod";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { withError } from "@/utils/middleware";
import {
  createMobileAuthState,
  storeMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";
import {
  getMobileAuthAppCallbackUrl,
  getMobileAuthBaseUrlOrigin,
  getMobileAuthWebCallbackUrl,
  type MobileAuthReturnUrlMode,
} from "@/utils/mobile-auth/url";

const mobileAuthProviderSchema = z.enum(["apple", "google", "microsoft"]);
const mobileAuthReturnUrlModeSchema = z.enum(["app-link", "custom-scheme"]);

const startMobileAuthSchema = z.object({
  provider: mobileAuthProviderSchema,
  returnUrlMode: mobileAuthReturnUrlModeSchema.optional(),
});

export type StartMobileAuthResponse = {
  authorizationURL: string;
  authSessionReturnUrl: string;
  oauthState: string;
  state: string;
};

export const POST = withError("mobile-auth/start", async (request) => {
  const body = startMobileAuthSchema.parse(await request.json());
  const state = createMobileAuthState();
  const returnUrlMode: MobileAuthReturnUrlMode =
    body.returnUrlMode ?? "app-link";
  const authSessionReturnUrl =
    getMobileAuthAppCallbackUrl(returnUrlMode).toString();
  const webCallbackUrl = getMobileAuthWebCallbackUrl(state);

  const signInResponse = await betterAuthConfig.handler(
    new Request(
      new URL("/api/auth/sign-in/social", getMobileAuthBaseUrlOrigin()),
      {
        body: JSON.stringify({
          provider: body.provider,
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
  const oauthState = getOAuthStateCookieValue(
    signInResponse.headers.get("set-cookie"),
  );

  if (!signInResponse.ok || !signInBody?.url || !oauthState) {
    throw new SafeError("Failed to start authentication", 500);
  }

  await storeMobileAuthState({
    returnUrlMode,
    state,
  });

  const response: StartMobileAuthResponse = {
    authorizationURL: signInBody.url,
    authSessionReturnUrl,
    oauthState,
    state,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
});

function getOAuthStateCookieValue(setCookie: string | null): string | null {
  if (!setCookie) return null;

  for (const cookie of splitSetCookieHeader(setCookie)) {
    const [nameValue] = cookie.split(";", 1);
    const [name, ...valueParts] = (nameValue || "").split("=");
    if (
      name === "__Secure-better-auth.oauth_state" ||
      name === "better-auth.oauth_state"
    ) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}

function splitSetCookieHeader(setCookie: string): string[] {
  const parts: string[] = [];
  let buffer = "";
  let i = 0;

  while (i < setCookie.length) {
    const char = setCookie[i];
    if (char === ",") {
      const recent = buffer.toLowerCase();
      const hasExpires = recent.includes("expires=");
      const hasGmt = /gmt/i.test(recent);

      if (hasExpires && !hasGmt) {
        buffer += char;
        i += 1;
        continue;
      }

      if (buffer.trim()) {
        parts.push(buffer.trim());
        buffer = "";
      }

      i += 1;
      if (setCookie[i] === " ") i += 1;
      continue;
    }

    buffer += char;
    i += 1;
  }

  if (buffer.trim()) {
    parts.push(buffer.trim());
  }

  return parts;
}
