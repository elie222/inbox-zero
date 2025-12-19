import { NextResponse } from "next/server";

/**
 * Custom error class for OAuth redirect responses.
 * Thrown when we need to redirect with an error during OAuth flow.
 */
export class RedirectError extends Error {
  redirectUrl: URL;
  responseHeaders: Headers;

  constructor(redirectUrl: URL, responseHeaders: Headers) {
    super("Redirect required");
    this.name = "RedirectError";
    this.redirectUrl = redirectUrl;
    this.responseHeaders = responseHeaders;
  }
}

/**
 * Redirect with a success message query param
 */
export function redirectWithMessage(
  redirectUrl: URL,
  message: string,
  responseHeaders: Headers,
): NextResponse {
  redirectUrl.searchParams.set("message", message);
  return NextResponse.redirect(redirectUrl, { headers: responseHeaders });
}

/**
 * Redirect with an error query param
 */
export function redirectWithError(
  redirectUrl: URL,
  error: string,
  responseHeaders: Headers,
): NextResponse {
  redirectUrl.searchParams.set("error", error);
  return NextResponse.redirect(redirectUrl, { headers: responseHeaders });
}
