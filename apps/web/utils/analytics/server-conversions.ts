import { createHash } from "node:crypto";
import { ONE_HOUR_MS } from "@/utils/date";
import { sendCompleteRegistrationEvent } from "@/utils/fb";
import type { Logger } from "@/utils/logger";
import { trackUserSignedUp } from "@/utils/posthog";
import prisma from "@/utils/prisma";
import { redis } from "@/utils/redis";

const REGISTRATION_COMPLETED_EVENT = "registration_completed";
const CONVERSION_DEDUPE_TTL_SECONDS = 24 * 60 * 60;

type RegistrationCompletedConversionEligibility =
  | { eligible: false }
  | { eligible: true; createdAt: Date };

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
    const eventId = getRegistrationCompletedConversionEventId({
      userId,
      createdAt,
    });
    const facebookPromise = trackConversionOnce({
      provider: "facebook",
      eventName: REGISTRATION_COMPLETED_EVENT,
      userId,
      createdAt,
      logger,
      track: () =>
        sendCompleteRegistrationEvent({
          userId,
          email,
          eventId,
          eventSourceUrl,
          ipAddress,
          userAgent,
          fbc,
          fbp,
        }),
    });
    const posthogPromise = trackConversionOnce({
      provider: "posthog",
      eventName: REGISTRATION_COMPLETED_EVENT,
      userId,
      createdAt,
      logger,
      track: () => trackUserSignedUp(email, createdAt),
    });

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
): Promise<RegistrationCompletedConversionEligibility> {
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

async function trackConversionOnce({
  provider,
  eventName,
  userId,
  createdAt,
  logger,
  track,
}: {
  provider: string;
  eventName: string;
  userId: string;
  createdAt: Date;
  logger: Logger;
  track: () => Promise<unknown>;
}) {
  const reservation = await reserveConversionTracking({
    provider,
    eventName,
    userId,
    createdAt,
    logger,
  });
  if (!reservation.shouldTrack) return;

  try {
    await track();
  } catch (error) {
    if (reservation.key) {
      await releaseConversionTrackingReservation({
        key: reservation.key,
        provider,
        eventName,
        userId,
        logger,
      });
    }
    throw error;
  }
}

async function reserveConversionTracking({
  provider,
  eventName,
  userId,
  createdAt,
  logger,
}: {
  provider: string;
  eventName: string;
  userId: string;
  createdAt: Date;
  logger: Logger;
}) {
  const key = getConversionTrackingDedupeKey({
    provider,
    eventName,
    userId,
    createdAt,
  });

  try {
    const reserved = await redis.set(key, "1", {
      ex: CONVERSION_DEDUPE_TTL_SECONDS,
      nx: true,
    });

    return reserved ? { shouldTrack: true, key } : { shouldTrack: false };
  } catch (error) {
    logger.error("Conversion tracking dedupe failed", {
      error,
      provider,
      eventName,
      userId,
    });
    return { shouldTrack: true };
  }
}

async function releaseConversionTrackingReservation({
  key,
  provider,
  eventName,
  userId,
  logger,
}: {
  key: string;
  provider: string;
  eventName: string;
  userId: string;
  logger: Logger;
}) {
  try {
    await redis.del(key);
  } catch (error) {
    logger.error("Conversion tracking dedupe release failed", {
      error,
      provider,
      eventName,
      userId,
    });
  }
}

function getRegistrationCompletedConversionEventId({
  userId,
  createdAt,
}: {
  userId: string;
  createdAt: Date;
}) {
  return createHash("sha256")
    .update(
      `${REGISTRATION_COMPLETED_EVENT}:${userId}:${createdAt.toISOString()}`,
    )
    .digest("hex");
}

function getConversionTrackingDedupeKey({
  provider,
  eventName,
  userId,
  createdAt,
}: {
  provider: string;
  eventName: string;
  userId: string;
  createdAt: Date;
}) {
  return [
    "conversion",
    provider,
    eventName,
    userId,
    createdAt.toISOString(),
  ].join(":");
}
