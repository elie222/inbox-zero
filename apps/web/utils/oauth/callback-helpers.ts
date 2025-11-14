import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  parseOAuthStateResultCookie,
  encodeOAuthStateResultCookie,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

interface CheckDedupeParams {
  request: NextRequest;
  stateCookieName: string;
  resultCookieName: string;
  baseUrl: string;
}

/**
 * Checks if this OAuth callback has already been processed.
 * If so, returns the cached redirect response.
 * Otherwise, returns null to continue processing.
 */
export function checkOAuthCallbackDedupe({
  request,
  stateCookieName,
  resultCookieName,
  baseUrl,
}: CheckDedupeParams): NextResponse | null {
  const receivedState = request.nextUrl.searchParams.get("state");
  const completedState = parseOAuthStateResultCookie(
    request.cookies.get(resultCookieName)?.value,
  );

  if (
    receivedState &&
    completedState &&
    completedState.state === receivedState &&
    Object.keys(completedState.params).length > 0
  ) {
    const deduplicatedRedirect = new URL("/accounts", baseUrl);
    for (const [key, value] of Object.entries(completedState.params)) {
      deduplicatedRedirect.searchParams.set(key, value);
    }
    const deduplicatedResponse = NextResponse.redirect(deduplicatedRedirect);
    deduplicatedResponse.cookies.delete(stateCookieName);
    return deduplicatedResponse;
  }

  return null;
}

interface BuildSuccessRedirectParams {
  state: string;
  params: Record<string, string>;
  stateCookieName: string;
  resultCookieName: string;
  baseUrl: string;
}

/**
 * Builds a success redirect response with query params and sets the result cookie
 * for deduplication on subsequent requests.
 */
export function buildOAuthSuccessRedirect({
  state,
  params,
  stateCookieName,
  resultCookieName,
  baseUrl,
}: BuildSuccessRedirectParams): NextResponse {
  const redirectUrl = new URL("/accounts", baseUrl);
  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }

  const successResponse = NextResponse.redirect(redirectUrl);
  successResponse.cookies.delete(stateCookieName);
  successResponse.cookies.set(
    resultCookieName,
    encodeOAuthStateResultCookie({
      state,
      params,
    }),
    oauthStateCookieOptions,
  );

  return successResponse;
}
