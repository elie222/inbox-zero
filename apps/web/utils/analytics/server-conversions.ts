import { ONE_HOUR_MS } from "@/utils/date";
import { sendCompleteRegistrationEvent } from "@/utils/fb";
import type { Logger } from "@/utils/logger";
import { trackUserSignedUp } from "@/utils/posthog";
import prisma from "@/utils/prisma";

export async function trackRegistrationCompletedConversion({
  userId,
  email,
  eventSourceUrl,
  ipAddress,
  userAgent,
  fbc,
  fbp,
  logger,
}: {
  userId: string;
  email: string;
  eventSourceUrl: string;
  ipAddress: string;
  userAgent: string;
  fbc: string;
  fbp: string;
  logger: Logger;
}) {
  const facebookPromise = sendCompleteRegistrationEvent({
    userId,
    email,
    eventSourceUrl,
    ipAddress,
    userAgent,
    fbc,
    fbp,
  });
  const posthogPromise = storePosthogSignupEvent(userId, email, logger);

  const [facebookResult, posthogResult] = await Promise.allSettled([
    facebookPromise,
    posthogPromise,
  ]);

  if (facebookResult.status === "rejected") {
    logger.error("Facebook tracking failed", {
      error: facebookResult.reason,
      email,
    });
  }

  if (posthogResult.status === "rejected") {
    logger.error("Posthog tracking failed", {
      error: posthogResult.reason,
      email,
    });
  }

  return {
    tracked:
      posthogResult.status === "fulfilled" && posthogResult.value === true,
  };
}

async function storePosthogSignupEvent(
  userId: string,
  email: string,
  logger: Logger,
) {
  const userCreatedAt = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!userCreatedAt) {
    logger.error("storePosthogSignupEvent: User not found", { userId });
    return false;
  }

  const ONE_HOUR_AGO = new Date(Date.now() - ONE_HOUR_MS);

  if (userCreatedAt.createdAt < ONE_HOUR_AGO) {
    logger.warn("storePosthogSignupEvent: User created more than an hour ago", {
      userId,
    });
    return false;
  }

  await trackUserSignedUp(email, userCreatedAt.createdAt);
  return true;
}
