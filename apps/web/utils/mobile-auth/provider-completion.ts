import type { createAuthMiddleware } from "better-auth/api";
import { mobileAuthProviderSchema } from "@/utils/mobile-auth/providers";
import { completeMobileAuthState } from "@/utils/mobile-auth/oauth-code";
import {
  getMobileAuthBaseUrlOrigin,
  MOBILE_AUTH_WEB_CALLBACK_PATH,
} from "@/utils/mobile-auth/url";

export async function mobileAuthProviderCompletion(
  context: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0],
) {
  if (
    !["/callback/:id", "/callback/:id/oauth-proxy"].includes(context.path ?? "")
  )
    return;
  const parsedProvider = mobileAuthProviderSchema.safeParse(context.params?.id);
  if (!parsedProvider.success) return;
  const provider = parsedProvider.data;
  const session = context.context.newSession;
  const location = context.context.responseHeaders?.get("location");
  if (!provider || !session || !location) return;
  const url = new URL(location, getMobileAuthBaseUrlOrigin());
  if (
    url.origin !== getMobileAuthBaseUrlOrigin() ||
    url.pathname !== MOBILE_AUTH_WEB_CALLBACK_PATH ||
    url.searchParams.has("error")
  )
    return;
  const state = url.searchParams.get("state");
  const completionToken = url.searchParams.get("completion");
  if (!state || !completionToken) return;
  await completeMobileAuthState({
    state,
    provider,
    completionToken,
    sessionToken: session.session.token,
  });
}
