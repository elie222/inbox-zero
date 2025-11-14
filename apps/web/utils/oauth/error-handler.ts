import { NextResponse } from "next/server";
import type { Logger } from "@/utils/logger";

interface ErrorHandlerParams {
  error: unknown;
  redirectUrl: URL;
  response: NextResponse;
  stateCookieName: string;
  logger: Logger;
}

export function handleOAuthCallbackError({
  error,
  redirectUrl,
  response,
  stateCookieName,
  logger,
}: ErrorHandlerParams): NextResponse {
  logger.error("Error in OAuth linking callback:", { error });
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  redirectUrl.searchParams.set("error", "link_failed");
  redirectUrl.searchParams.set("error_description", errorMessage);
  response.cookies.delete(stateCookieName);
  return NextResponse.redirect(redirectUrl, { headers: response.headers });
}
