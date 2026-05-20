import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { auth } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { withError } from "@/utils/middleware";
import {
  createMobileAuthCode,
  isValidMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";

const callbackQuerySchema = z.object({
  state: z.string().trim().min(1).max(256),
});

export const GET = withError("mobile-auth/callback", async (request) => {
  const query = callbackQuerySchema.parse({
    state: request.nextUrl.searchParams.get("state"),
  });

  if (!isValidMobileAuthState(query.state)) {
    throw new SafeError("Invalid authentication state", 400);
  }

  const session = await auth(request.headers);
  const userId = session?.user?.id;
  if (!userId) {
    return redirectToMobileCallback({
      error: "missing_session",
      errorDescription: "Authentication session was not found",
      state: query.state,
    });
  }

  const code = await createMobileAuthCode({
    state: query.state,
    userId,
  });

  request.logger.info("Created mobile auth code", {
    userId,
  });

  return redirectToMobileCallback({
    code,
    state: query.state,
  });
});

function redirectToMobileCallback(
  params: { state: string } & (
    | { code: string }
    | { error: string; errorDescription: string }
  ),
) {
  const redirectUrl = getMobileAuthCallbackUrl();
  redirectUrl.searchParams.set("state", params.state);

  if ("code" in params) {
    redirectUrl.searchParams.set("code", params.code);
  } else {
    redirectUrl.searchParams.set("error", params.error);
    redirectUrl.searchParams.set("error_description", params.errorDescription);
  }

  const response = NextResponse.redirect(redirectUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function getMobileAuthCallbackUrl(): URL {
  const baseUrl = new URL(env.NEXT_PUBLIC_BASE_URL);
  if (baseUrl.protocol !== "https:" && env.MOBILE_AUTH_ORIGIN) {
    const origin = env.MOBILE_AUTH_ORIGIN.endsWith("://")
      ? env.MOBILE_AUTH_ORIGIN
      : `${env.MOBILE_AUTH_ORIGIN.replace(/\/+$/u, "")}/`;
    return new URL(`${origin}auth-callback`);
  }

  return new URL("/auth-callback", baseUrl.origin);
}
