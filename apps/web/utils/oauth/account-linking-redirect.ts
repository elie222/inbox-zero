import { NextResponse } from "next/server";
import { env } from "@/env";
import { normalizeInternalPath } from "@/utils/path";

export function createAccountLinkingRedirect(params?: {
  query?: Record<string, string | null | undefined>;
  redirectPath?: string;
  stateCookieName?: string;
}) {
  const redirectPath =
    normalizeInternalPath(params?.redirectPath) ?? "/accounts";
  const redirectUrl = new URL(redirectPath, env.NEXT_PUBLIC_BASE_URL);

  for (const [key, value] of Object.entries(params?.query ?? {})) {
    if (value != null) {
      redirectUrl.searchParams.set(key, value);
    }
  }

  const response = NextResponse.redirect(redirectUrl);

  if (params?.stateCookieName) {
    response.cookies.delete(params.stateCookieName);
  }

  return response;
}
