import { cookies } from "next/headers";
import { auth } from "@/utils/auth";
import { redirect } from "next/navigation";
import { after } from "next/server";
import prisma from "@/utils/prisma";
import {
  LAST_EMAIL_ACCOUNT_COOKIE,
  parseLastEmailAccountCookieValue,
} from "@/utils/cookies";
import { buildLoginRedirectUrl, buildRedirectUrl } from "@/utils/redirect";
import { createScopedLogger } from "@/utils/logger";
import { flushLoggerSafely } from "@/utils/logger-flush";

const logger = createScopedLogger("account-redirect");

export async function redirectToEmailAccountPath(
  path: `/${string}`,
  searchParams?: Record<string, string | string[] | undefined>,
) {
  const timing = createRedirectTiming(path, searchParams);
  const session = await measureRedirectStep(timing, "auth", () => auth());
  const userId = session?.user.id;
  if (!userId) {
    logRedirectTiming(timing, {
      outcome: "login",
      usedLastEmailAccountCookie: false,
      usedFallbackAccountLookup: false,
      foundEmailAccount: false,
    });
    redirect(buildLoginRedirectUrl(buildRedirectUrl(path, searchParams)));
  }

  const lastEmailAccountId = await measureRedirectStep(
    timing,
    "last-email-account-cookie",
    () => getLastEmailAccountFromCookie(userId),
  );

  let emailAccountId = lastEmailAccountId;

  // If no last account is available, fall back to the first account.
  if (!emailAccountId) {
    const emailAccount = await measureRedirectStep(
      timing,
      "fallback-email-account-lookup",
      () =>
        prisma.emailAccount.findFirst({
          where: { userId },
          select: { id: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
    );
    emailAccountId = emailAccount?.id ?? null;
  }

  if (!emailAccountId) {
    logRedirectTiming(timing, {
      outcome: "connect-mailbox",
      usedLastEmailAccountCookie: !!lastEmailAccountId,
      usedFallbackAccountLookup: !lastEmailAccountId,
      foundEmailAccount: false,
    });
    redirect(
      buildRedirectUrl("/connect-mailbox", {
        next: buildRedirectUrl(path, searchParams),
      }),
    );
  }

  const redirectUrl = buildRedirectUrl(
    `/${emailAccountId}${path}`,
    searchParams,
  );

  logRedirectTiming(timing, {
    outcome: "account-path",
    usedLastEmailAccountCookie: !!lastEmailAccountId,
    usedFallbackAccountLookup: !lastEmailAccountId,
    foundEmailAccount: true,
  });
  redirect(redirectUrl);
}

async function getLastEmailAccountFromCookie(
  userId: string,
): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(LAST_EMAIL_ACCOUNT_COOKIE)?.value;
    return parseLastEmailAccountCookieValue({ userId, cookieValue });
  } catch {
    return null;
  }
}

type RedirectTiming = {
  path: string;
  searchParamKeys: string[];
  startedAt: number;
  stepDurationsMs: Record<string, number>;
};

function createRedirectTiming(
  path: `/${string}`,
  searchParams?: Record<string, string | string[] | undefined>,
): RedirectTiming {
  return {
    path,
    searchParamKeys: Object.keys(searchParams ?? {}).sort(),
    startedAt: Date.now(),
    stepDurationsMs: {},
  };
}

async function measureRedirectStep<T>(
  timing: RedirectTiming,
  step: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    timing.stepDurationsMs[step] = Date.now() - startedAt;
  }
}

function logRedirectTiming(
  timing: RedirectTiming,
  metadata: {
    outcome: "account-path" | "connect-mailbox" | "login";
    usedLastEmailAccountCookie: boolean;
    usedFallbackAccountLookup: boolean;
    foundEmailAccount: boolean;
  },
) {
  const durationMs = Date.now() - timing.startedAt;
  logger.info("Resolved account redirect", {
    path: timing.path,
    searchParamKeys: timing.searchParamKeys,
    durationMs,
    stepDurationsMs: timing.stepDurationsMs,
    ...metadata,
  });

  after(async () => {
    await flushLoggerSafely(logger, {
      path: timing.path,
      durationMs,
      outcome: metadata.outcome,
    });
  });
}
