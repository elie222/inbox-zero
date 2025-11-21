import { NextResponse } from "next/server";
import type { Logger } from "@/utils/logger";

interface ErrorHandlerParams {
  error: unknown;
  redirectUrl: URL;
  stateCookieName: string;
  logger: Logger;
}

export function handleOAuthCallbackError({
  error,
  redirectUrl,
  stateCookieName,
  logger,
}: ErrorHandlerParams): NextResponse {
  logger.error("Error in OAuth linking callback:", { error });
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  redirectUrl.searchParams.set("error", "link_failed");
  redirectUrl.searchParams.set("error_description", errorMessage);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete(stateCookieName);
  return response;
}
