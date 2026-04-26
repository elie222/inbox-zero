import type { NextResponse } from "next/server";
import type { Logger } from "@/utils/logger";
import { createAccountLinkingRedirect } from "@/utils/oauth/account-linking-redirect";
import { parseSignedOAuthState } from "@/utils/oauth/state";

interface ValidateCallbackParams {
  code: string | null;
  logger: Logger;
  receivedState: string | null;
  stateCookieName: string;
  storedState: string | undefined;
}

type ValidationResult =
  | {
      success: true;
      targetUserId: string;
      stateNonce: string;
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
  logger,
}: ValidateCallbackParams): ValidationResult {
  const stateValidation = validateMatchingSignedOAuthState({
    logger,
    receivedState,
    storedState,
  });
  if (!stateValidation.success) {
    return {
      success: false,
      response: createAccountLinkingRedirect({
        query: { error: stateValidation.error },
        stateCookieName,
      }),
    };
  }

  if (!code) {
    logger.warn("Missing code in OAuth callback");
    return {
      success: false,
      response: createAccountLinkingRedirect({
        query: { error: "missing_code" },
        stateCookieName,
      }),
    };
  }

  return {
    success: true,
    targetUserId: stateValidation.targetUserId,
    stateNonce: stateValidation.stateNonce,
    code,
  };
}

export function hasValidMatchingSignedOAuthState(params: {
  logger: Logger;
  receivedState: string | null;
  storedState: string | undefined;
}) {
  return validateMatchingSignedOAuthState(params).success;
}

function validateMatchingSignedOAuthState(params: {
  logger: Logger;
  receivedState: string | null;
  storedState: string | undefined;
}):
  | {
      success: true;
      targetUserId: string;
      stateNonce: string;
    }
  | {
      success: false;
      error: "invalid_state" | "invalid_state_format";
    } {
  if (
    !params.storedState ||
    !params.receivedState ||
    params.storedState !== params.receivedState
  ) {
    params.logger.warn("Invalid state during OAuth callback", {
      receivedState: params.receivedState,
      hasStoredState: !!params.storedState,
    });
    return {
      success: false,
      error: "invalid_state",
    };
  }

  try {
    const payload = parseSignedOAuthState<{ userId: string }>(
      params.storedState,
    );

    if (typeof payload.userId !== "string") {
      params.logger.error("Failed to decode OAuth callback state", {
        hasStoredState: !!params.storedState,
      });
      return {
        success: false,
        error: "invalid_state_format",
      };
    }

    return {
      success: true,
      targetUserId: payload.userId,
      stateNonce: payload.nonce,
    };
  } catch (error) {
    params.logger.error("Failed to verify OAuth callback state", {
      error,
      hasStoredState: !!params.storedState,
    });
    return {
      success: false,
      error: "invalid_state_format",
    };
  }
}
