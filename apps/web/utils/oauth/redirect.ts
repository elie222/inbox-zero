import { NextResponse } from "next/server";
import { env } from "@/env";

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
    this.redirectUrl = sanitizeRedirectUrl(redirectUrl);
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
  return NextResponse.redirect(sanitizeRedirectUrl(redirectUrl), {
    headers: responseHeaders,
  });
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
  return NextResponse.redirect(sanitizeRedirectUrl(redirectUrl), {
    headers: responseHeaders,
  });
}

function sanitizeRedirectUrl(redirectUrl: URL): URL {
  // OAuth callbacks should always land back on this app, even if a caller
  // hands us an absolute URL from outside our origin.
  return new URL(
    `/${redirectUrl.pathname.replace(/^\/+/u, "")}${redirectUrl.search}${redirectUrl.hash}`,
    env.NEXT_PUBLIC_BASE_URL,
  );
}
