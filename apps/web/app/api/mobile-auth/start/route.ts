import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { withError } from "@/utils/middleware";
import { createMobileAuthState } from "@/utils/mobile-auth/oauth-code";

const mobileAuthProviderSchema = z.enum(["apple", "google", "microsoft"]);

const startMobileAuthSchema = z.object({
  provider: mobileAuthProviderSchema,
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
  const webCallbackUrl = getMobileAuthWebCallbackUrl(state);

  const signInResponse = await betterAuthConfig.handler(
    new Request(new URL("/api/auth/sign-in/social", getBaseUrlOrigin()), {
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
    }),
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

  const response: StartMobileAuthResponse = {
    authorizationURL: signInBody.url,
    authSessionReturnUrl: getAuthSessionReturnUrl(),
    oauthState,
    state,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
});

function getMobileAuthWebCallbackUrl(state: string): string {
  const callbackUrl = new URL("/api/mobile-auth/callback", getBaseUrlOrigin());
  callbackUrl.searchParams.set("state", state);
  return callbackUrl.toString();
}

function getAuthSessionReturnUrl(): string {
  const baseUrl = new URL(env.NEXT_PUBLIC_BASE_URL);
  if (baseUrl.protocol !== "https:" && env.MOBILE_AUTH_ORIGIN) {
    const origin = env.MOBILE_AUTH_ORIGIN.endsWith("://")
      ? env.MOBILE_AUTH_ORIGIN
      : `${env.MOBILE_AUTH_ORIGIN.replace(/\/+$/u, "")}/`;
    return new URL(`${origin}auth-callback`).toString();
  }

  return new URL("/auth-callback", baseUrl.origin).toString();
}

function getBaseUrlOrigin(): string {
  return new URL(env.NEXT_PUBLIC_BASE_URL).origin;
}

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
