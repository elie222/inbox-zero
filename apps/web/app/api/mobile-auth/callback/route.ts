import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { withError } from "@/utils/middleware";
import {
  consumeMobileAuthState,
  consumeMobileAuthFailureState,
  createMobileAuthCode,
  isValidMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";
import { getMobileAuthAppCallbackUrl } from "@/utils/mobile-auth/url";

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

  if (request.nextUrl.searchParams.has("error")) {
    const { returnUrlMode } = await consumeMobileAuthFailureState({
      state: query.state,
    });
    return redirectToMobileCallback(
      query.state,
      {
        error: "authentication_failed",
        error_description:
          "Provider authentication did not complete. Please try again.",
      },
      returnUrlMode,
    );
  }

  const session = await auth(request.headers);
  const userId = session?.user?.id;
  if (!userId || !session.session.token) {
    throw new SafeError("Authentication session was not found", 401);
  }

  if (session.session.emailOtp) {
    throw new SafeError(
      "Sign in with your connected provider to connect the mobile app.",
      403,
    );
  }

  const { returnUrlMode, codeChallenge } = await consumeMobileAuthState({
    state: query.state,
    sessionToken: session.session.token,
  });

  const code = await createMobileAuthCode({
    codeChallenge,
    state: query.state,
    userId,
  });

  request.logger.info("Created mobile auth code", {
    userId,
  });

  return redirectToMobileCallback(query.state, { code }, returnUrlMode);
});

function redirectToMobileCallback(
  state: string,
  params: Record<string, string>,
  returnUrlMode?: Parameters<typeof getMobileAuthAppCallbackUrl>[0],
) {
  const redirectUrl = getMobileAuthAppCallbackUrl(returnUrlMode);
  redirectUrl.searchParams.set("state", state);
  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(redirectUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
