import { after } from "next/server";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import type { auth } from "@/utils/auth";

const logger = createScopedLogger("utms");

type UtmValues = {
  utmCampaign?: string;
  utmMedium?: string;
  utmSource?: string;
  utmTerm?: string;
  affiliate?: string;
  referralCode?: string;
};

export function registerUtmTracking({
  authPromise,
  cookieStore,
}: {
  authPromise: ReturnType<typeof auth>;
  cookieStore: ReadonlyRequestCookies;
}) {
  const utmValues = extractUtmValues(cookieStore);

  after(async () => {
    const user = await authPromise;
    if (!user?.user) return;
    await fetchUserAndStoreUtms(user.user.id, utmValues);
  });

  return utmValues;
}

// Extract UTM values from cookies before passing to after() callback
// This is required because request APIs (cookies/headers) cannot be used
// inside after() in Server Components - only in Server Actions and Route Handlers
// See: https://nextjs.org/docs/app/api-reference/functions/after
export function extractUtmValues(cookies: ReadonlyRequestCookies): UtmValues {
  return {
    utmCampaign: decodeCookieValue(cookies.get("utm_campaign")?.value),
    utmMedium: decodeCookieValue(cookies.get("utm_medium")?.value),
    utmSource: decodeCookieValue(cookies.get("utm_source")?.value),
    utmTerm: decodeCookieValue(cookies.get("utm_term")?.value),
    affiliate: decodeCookieValue(cookies.get("affiliate")?.value),
    referralCode: decodeCookieValue(cookies.get("referral_code")?.value),
  };
}

function decodeCookieValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function fetchUserAndStoreUtms(
  userId: string,
  utmValues: UtmValues,
) {
  const user = await prisma.user
    .findUnique({
      where: { id: userId },
      select: { utms: true },
    })
    .catch((error) => {
      logger.error("Failed to fetch user", { error, userId });
      return null;
    });

  if (user && !user.utms) {
    await storeUtms(userId, utmValues);
  }
}

async function storeUtms(userId: string, utmValues: UtmValues) {
  logger.info("Storing utms", { userId });

  const utms = {
    utmCampaign: utmValues.utmCampaign,
    utmMedium: utmValues.utmMedium,
    utmSource: utmValues.utmSource,
    utmTerm: utmValues.utmTerm,
    affiliate: utmValues.affiliate,
    referralCode: utmValues.referralCode,
  };

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { utms },
    });

    logger.info("Stored utms", { utms, userId });
  } catch (error) {
    logger.error("Failed to store utms", { error, userId });
  }
}
