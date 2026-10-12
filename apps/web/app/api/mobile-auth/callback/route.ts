import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { withError } from "@/utils/middleware";
import {
  consumeMobileAuthFailureState,
  createMobileAuthCode,
  getMobileAuthFlowId,
  isValidMobileAuthState,
  redeemMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";
import {
  getMobileAuthAppCallbackUrl,
  getMobileAuthBaseUrlOrigin,
} from "@/utils/mobile-auth/url";

const callbackQuerySchema = z.object({
  state: z.string().trim().min(1).max(256),
});

export const GET = withError("mobile-auth/callback", async (request) => {
  const query = callbackQuerySchema.safeParse({
    state: request.nextUrl.searchParams.get("state"),
  });

  if (!query.success || !isValidMobileAuthState(query.data.state)) {
    request.logger.warn("Mobile auth callback state rejected", {
      reason: "invalid_format",
    });
    return redirectToAuthError();
  }

  const logger = request.logger.with({
    flowId: getMobileAuthFlowId(query.data.state),
  });
  const hasProviderError = request.nextUrl.searchParams.has("error");
  // Fetch metadata shows whether a repeat hit is a prefetch or another client.
  logger.info("Mobile auth callback received", {
    hasProviderError,
    secFetchDest: request.headers.get("sec-fetch-dest"),
    secFetchMode: request.headers.get("sec-fetch-mode"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    secFetchUser: request.headers.get("sec-fetch-user"),
    secPurpose:
      request.headers.get("sec-purpose") ?? request.headers.get("purpose"),
    userAgent: request.headers.get("user-agent"),
  });

  if (hasProviderError) {
    let returnUrlMode: Awaited<
      ReturnType<typeof consumeMobileAuthFailureState>
    >["returnUrlMode"];
    try {
      ({ returnUrlMode } = await consumeMobileAuthFailureState({
        state: query.data.state,
      }));
    } catch (error) {
      if (error instanceof SafeError) return redirectToAuthError();
      throw error;
    }
    return redirectToMobileCallback(
      query.data.state,
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
    logger.warn("Mobile auth callback rejected", {
      reason: "missing_session",
    });
    return redirectToAuthError();
  }

  if (session.session.emailOtp) {
    logger.warn("Mobile auth callback rejected", {
      reason: "email_otp_session",
    });
    return redirectToAuthError();
  }

  let grant: Awaited<ReturnType<typeof redeemMobileAuthState>>;
  try {
    grant = await redeemMobileAuthState({
      state: query.data.state,
      sessionToken: session.session.token,
    });
  } catch (error) {
    if (error instanceof SafeError) return redirectToAuthError();
    throw error;
  }

  const code = await createMobileAuthCode({
    codeChallenge: grant.codeChallenge,
    state: query.data.state,
    userId,
  });

  logger.info("Created mobile auth code", {
    userId,
    returnUrlMode: grant.returnUrlMode,
  });

  return redirectToMobileCallback(
    query.data.state,
    { code },
    grant.returnUrlMode,
  );
});

function redirectToAuthError() {
  const response = NextResponse.redirect(
    new URL("/login/app-sign-in-error", getMobileAuthBaseUrlOrigin()),
    302,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

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
