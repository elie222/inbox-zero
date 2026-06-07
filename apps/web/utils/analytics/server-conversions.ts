import { ONE_HOUR_MS } from "@/utils/date";
import { sendCompleteRegistrationEvent } from "@/utils/fb";
import type { Logger } from "@/utils/logger";
import { trackUserSignedUp } from "@/utils/posthog";
import prisma from "@/utils/prisma";

export async function trackRegistrationCompletedConversion({
  userId,
  email,
  createdAt,
  eventSourceUrl,
  ipAddress,
  userAgent,
  fbc,
  fbp,
  logger,
}: {
  userId: string;
  email: string;
  createdAt: Date;
  eventSourceUrl: string;
  ipAddress: string;
  userAgent: string;
  fbc: string;
  fbp: string;
  logger: Logger;
}) {
  try {
    const facebookPromise = sendCompleteRegistrationEvent({
      userId,
      email,
      eventSourceUrl,
      ipAddress,
      userAgent,
      fbc,
      fbp,
    });
    const posthogPromise = trackUserSignedUp(email, createdAt);

    const [facebookResult, posthogResult] = await Promise.allSettled([
      facebookPromise,
      posthogPromise,
    ]);

    if (facebookResult.status === "rejected") {
      logger.error("Facebook tracking failed", {
        error: facebookResult.reason,
        userId,
      });
    }

    if (posthogResult.status === "rejected") {
      logger.error("Posthog tracking failed", {
        error: posthogResult.reason,
        userId,
      });
    }
  } catch (error) {
    logger.error("Registration conversion tracking failed", {
      error,
      userId,
    });
  }
}

export async function getRegistrationCompletedConversionEligibility(
  userId: string,
  logger: Logger,
) {
  const userCreatedAt = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!userCreatedAt) {
    logger.error(
      "getRegistrationCompletedConversionEligibility: User not found",
      {
        userId,
      },
    );
    return { eligible: false };
  }

  const ONE_HOUR_AGO = new Date(Date.now() - ONE_HOUR_MS);

  if (userCreatedAt.createdAt < ONE_HOUR_AGO) {
    logger.warn(
      "getRegistrationCompletedConversionEligibility: User created more than an hour ago",
      { userId },
    );
    return { eligible: false };
  }

  return { eligible: true, createdAt: userCreatedAt.createdAt };
}
