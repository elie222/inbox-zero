import { NextResponse } from "next/server";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
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
  reconnectEmailAccountId,
  stateCookieName,
  logger,
}: {
  userId: string;
  reconnectEmailAccountId: string | null;
  stateCookieName: string;
  logger: Logger;
}) {
  const accountsRedirect = () =>
    createAccountLinkingRedirect({
      query: { success: "tokens_updated" },
      stateCookieName,
    });

  let completedOnboarding = true;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { completedOnboardingAt: true },
    });
    completedOnboarding = !user || !!user.completedOnboardingAt;
  } catch (error) {
    logger.warn("Failed to load onboarding state after reconnect", { error });
  }

  if (completedOnboarding) return accountsRedirect();

  // Users sent to reconnect during onboarding (missing permissions) should
  // resume setup for the mailbox they reconnected instead of landing on the
  // accounts page.
  return createAccountLinkingRedirect({
    path: reconnectEmailAccountId
      ? `/${reconnectEmailAccountId}/onboarding`
      : "/welcome-redirect",
    stateCookieName,
  });
}
