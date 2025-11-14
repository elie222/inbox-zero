import { NextResponse } from "next/server";
import type { Logger } from "@/utils/logger";
import { parseOAuthState } from "@/utils/oauth/state";

interface ValidateCallbackParams {
  code: string | null;
  receivedState: string | null;
  storedState: string | undefined;
  stateCookieName: string;
  baseUrl: string;
  logger: Logger;
}

type ValidationResult =
  | {
      success: true;
      targetUserId: string;
      action: "auto" | "merge_confirmed";
      code: string;
    }
  | {
      success: false;
      response: NextResponse;
    };

export function validateOAuthCallback({
  code,
  receivedState,
  storedState,
  stateCookieName,
  baseUrl,
  logger,
}: ValidateCallbackParams): ValidationResult {
  const redirectUrl = new URL("/accounts", baseUrl);
  const response = NextResponse.redirect(redirectUrl);

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during OAuth callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    response.cookies.delete(stateCookieName);
    return {
      success: false,
      response: NextResponse.redirect(redirectUrl, {
        headers: response.headers,
      }),
    };
  }

  let decodedState: {
    userId: string;
    action: "auto" | "merge_confirmed";
    nonce: string;
  };
  try {
    decodedState = parseOAuthState(storedState);
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    response.cookies.delete(stateCookieName);
    return {
      success: false,
      response: NextResponse.redirect(redirectUrl, {
        headers: response.headers,
      }),
    };
  }

  if (!code) {
    logger.warn("Missing code in OAuth callback");
    redirectUrl.searchParams.set("error", "missing_code");
    response.cookies.delete(stateCookieName);
    return {
      success: false,
      response: NextResponse.redirect(redirectUrl, {
        headers: response.headers,
      }),
    };
  }

  return {
    success: true,
    targetUserId: decodedState.userId,
    action: decodedState.action,
    code,
  };
}
