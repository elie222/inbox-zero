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

export function isAllowedExpoAuthorizationUrl(
  url: URL,
  baseURL: string,
  allowLocalHttp: boolean,
) {
  if (url.origin === new URL(baseURL).origin) return false;
  if (url.protocol === "https:") return true;
  if (!allowLocalHttp || url.protocol !== "http:") return false;
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname.endsWith(".localhost")
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
