import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";

export function createAccountLinkingRedirect(params?: {
  path?: string;
  query?: Record<string, string | null | undefined>;
  stateCookieName?: string;
}) {
  const redirectUrl = new URL(
    params?.path ?? "/accounts",
    env.NEXT_PUBLIC_BASE_URL,
  );

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

export async function createTokensUpdatedRedirect({
  userId,
  stateCookieName,
}: {
  userId: string;
  stateCookieName: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { completedOnboardingAt: true },
  });

  // Users sent to reconnect during onboarding (missing permissions) should
  // resume setup instead of landing on the accounts page.
  if (user && !user.completedOnboardingAt) {
    return createAccountLinkingRedirect({
      path: "/welcome-redirect",
      stateCookieName,
    });
  }

  return createAccountLinkingRedirect({
    query: { success: "tokens_updated" },
    stateCookieName,
  });
}
