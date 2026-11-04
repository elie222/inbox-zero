import { type BetterAuthPlugin, HIDE_METADATA } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { z } from "zod";

// The native iOS and Android clients call the `/expo-authorization-proxy` path
// and send `expo-origin`, names inherited from the Expo plugin. Keep them stable
// so those clients keep working without the Expo package.
export function nativeAuthPlugin() {
  return {
    id: "native-auth",
    onRequest: async (request) => {
      if (request.headers.get("origin")) return;
      const nativeOrigin = request.headers.get("expo-origin");
      if (!nativeOrigin) return;
      const headers = new Headers(request.headers);
      headers.set("origin", nativeOrigin);
      return { request: new Request(request, { headers }) };
    },
    endpoints: {
      nativeAuthorizationProxy: nativeAuthorizationProxy(),
    },
  } satisfies BetterAuthPlugin;
}

const AUTHORIZATION_HOSTS = new Set([
  "accounts.google.com",
  "appleid.apple.com",
  "login.microsoftonline.com",
]);

export function isAllowedNativeAuthorizationUrl(
  url: URL,
  baseURL: string,
  allowLocalHttp: boolean,
  emulatorOrigins: readonly string[] = [],
) {
  if (url.origin === new URL(baseURL).origin) return false;
  if (configuredEmulatorOrigins(emulatorOrigins).has(url.origin)) return true;
  if (url.protocol === "https:") {
    return AUTHORIZATION_HOSTS.has(url.hostname);
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

function nativeAuthorizationProxy() {
  return createAuthEndpoint(
    "/expo-authorization-proxy",
    {
      method: "GET",
      query: z.object({
        authorizationURL: z.string(),
        oauthState: z.string().min(1),
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
        !isAllowedNativeAuthorizationUrl(
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
      // Sets the encrypted state cookie in the browser session started by the
      // native app. Never sign a provider-supplied `state` value here.
      const oauthStateCookie = ctx.context.createAuthCookie("oauth_state", {
        maxAge: 600,
      });
      ctx.setCookie(
        oauthStateCookie.name,
        ctx.query.oauthState,
        oauthStateCookie.attributes,
      );
      return ctx.redirect(authorizationURL);
    },
  );
}
