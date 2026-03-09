import { NextResponse } from "next/server";
import type { Logger } from "@/utils/logger";
import {
  classifyMicrosoftOAuthError,
  getSafeMicrosoftOAuthErrorDescription,
} from "@/utils/oauth/microsoft-oauth";

interface ErrorHandlerParams {
  error: unknown;
  logger: Logger;
  redirectUrl: URL;
  stateCookieName: string;
  provider?: "google" | "microsoft";
}

export function handleOAuthCallbackError({
  error,
  redirectUrl,
  stateCookieName,
  logger,
  provider,
}: ErrorHandlerParams): NextResponse {
  logger.error("Error in OAuth linking callback:", { error });
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  if (provider === "microsoft") {
    const mappedError = classifyMicrosoftOAuthError(errorMessage);

    if (mappedError) {
      logger.warn("Mapped Microsoft OAuth linking error", {
        mappedError: mappedError.errorCode,
        aadstsCode: mappedError.aadstsCode,
      });
      redirectUrl.searchParams.set("error", mappedError.errorCode);
      redirectUrl.searchParams.set(
        "error_description",
        mappedError.userMessage,
      );
      const response = NextResponse.redirect(redirectUrl);
      response.cookies.delete(stateCookieName);
      return response;
    }

    const safeErrorDescription =
      getSafeMicrosoftOAuthErrorDescription(errorMessage);
    redirectUrl.searchParams.set("error", "link_failed");
    if (safeErrorDescription) {
      redirectUrl.searchParams.set("error_description", safeErrorDescription);
    }
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete(stateCookieName);
    return response;
  }

  redirectUrl.searchParams.set("error", "link_failed");
  redirectUrl.searchParams.set("error_description", errorMessage);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete(stateCookieName);
  return response;
}
