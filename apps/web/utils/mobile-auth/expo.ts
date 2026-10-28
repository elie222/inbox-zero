import { expo } from "@better-auth/expo";
import { HIDE_METADATA } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { z } from "zod";

// Preserve the Expo proxy/origin behavior, but omit the redirect hook that
// appends session cookies to custom-scheme callback URLs.
export function safeExpo() {
  const plugin = expo();
  const { after: _after, ...hooks } = plugin.hooks ?? {};
  return {
    ...plugin,
    hooks,
    endpoints: {
      ...plugin.endpoints,
      expoAuthorizationProxy: localExpoAuthorizationProxy(),
    },
  };
}

const EXPO_AUTHORIZATION_HOSTS = new Set([
  "accounts.google.com",
  "appleid.apple.com",
  "login.microsoftonline.com",
]);

export function isAllowedExpoAuthorizationUrl(
  url: URL,
  baseURL: string,
  allowLocalHttp: boolean,
  emulatorOrigins: readonly string[] = [],
) {
  if (url.origin === new URL(baseURL).origin) return false;
  if (configuredEmulatorOrigins(emulatorOrigins).has(url.origin)) return true;
  if (url.protocol === "https:") {
    return EXPO_AUTHORIZATION_HOSTS.has(url.hostname);
  }
  if (!allowLocalHttp || url.protocol !== "http:") return false;
  return isLocalEmulatorHost(url.hostname);
}

function configuredEmulatorOrigins(values: readonly string[]) {
  const origins = new Set<string>();
  for (const value of values) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
      if (
        parsed.protocol === "http:" &&
        !isLocalEmulatorHost(parsed.hostname)
      ) {
        continue;
      }
      origins.add(parsed.origin);
    } catch {
      // Ignore an unusable emulator base URL.
    }
  }
  return origins;
}

function isLocalEmulatorHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

function localExpoAuthorizationProxy() {
  return createAuthEndpoint(
    "/expo-authorization-proxy",
    {
      method: "GET",
      query: z.object({
        authorizationURL: z.string(),
        oauthState: z.string().optional(),
      }),
      metadata: HIDE_METADATA,
    },
    async (ctx) => {
      const { authorizationURL } = ctx.query;
      if (authorizationURL.includes("#")) {
        throw new APIError("BAD_REQUEST", {
          message: "Invalid authorizationURL",
        });
      }
      let url: URL;
      try {
        url = new URL(authorizationURL);
      } catch {
        throw new APIError("BAD_REQUEST", {
          message: "Invalid authorizationURL",
        });
      }
      if (
        !isAllowedExpoAuthorizationUrl(
          url,
          ctx.context.baseURL,
          process.env.NODE_ENV === "development",
          [process.env.GOOGLE_BASE_URL, process.env.MICROSOFT_BASE_URL].filter(
            (value): value is string => Boolean(value),
          ),
        )
      ) {
        throw new APIError("BAD_REQUEST", {
          message: "Invalid authorizationURL",
        });
      }
      const { oauthState } = ctx.query;
      if (oauthState) {
        const oauthStateCookie = ctx.context.createAuthCookie("oauth_state", {
          maxAge: 600,
        });
        ctx.setCookie(
          oauthStateCookie.name,
          oauthState,
          oauthStateCookie.attributes,
        );
        return ctx.redirect(authorizationURL);
      }
      const state = url.searchParams.get("state");
      if (!state) {
        throw new APIError("BAD_REQUEST", { message: "Unexpected error" });
      }
      const stateCookie = ctx.context.createAuthCookie("state", {
        maxAge: 300,
      });
      await ctx.setSignedCookie(
        stateCookie.name,
        state,
        ctx.context.secret,
        stateCookie.attributes,
      );
      return ctx.redirect(authorizationURL);
    },
  );
}
