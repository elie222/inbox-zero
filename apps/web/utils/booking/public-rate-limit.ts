import { SafeError } from "@/utils/error";
import type { PublicBookingBody } from "@/utils/actions/booking.validation";
import {
  checkRateLimit,
  createRateLimitKey,
  hashRateLimitValue,
} from "@/utils/rate-limit";
import type { Logger } from "@/utils/logger";

const PUBLIC_BOOKING_RATE_LIMITS = {
  ipLinkBurst: { limit: 8, windowSeconds: 10 * 60 },
  ipLinkDaily: { limit: 30, windowSeconds: 24 * 60 * 60 },
  guestLinkDaily: { limit: 5, windowSeconds: 24 * 60 * 60 },
  linkHourly: { limit: 50, windowSeconds: 60 * 60 },
  linkDaily: { limit: 200, windowSeconds: 24 * 60 * 60 },
} as const;

export async function enforcePublicBookingRateLimit({
  input,
  clientIp,
  logger,
}: {
  input: PublicBookingBody;
  clientIp: string;
  logger: Logger;
}) {
  const linkKey = `${input.slug}:${input.eventTypeSlug}`;
  const ipHash = hashRateLimitValue(clientIp);
  const guestEmailHash = hashRateLimitValue(input.guestEmail.toLowerCase());
  const rules = [
    {
      id: "ip-link-burst",
      key: createRateLimitKey([
        "rate-limit",
        "public-booking",
        "ip-link-burst",
        linkKey,
        ipHash,
      ]),
      ...PUBLIC_BOOKING_RATE_LIMITS.ipLinkBurst,
    },
    {
      id: "ip-link-daily",
      key: createRateLimitKey([
        "rate-limit",
        "public-booking",
        "ip-link-daily",
        linkKey,
        ipHash,
      ]),
      ...PUBLIC_BOOKING_RATE_LIMITS.ipLinkDaily,
    },
    {
      id: "guest-link-daily",
      key: createRateLimitKey([
        "rate-limit",
        "public-booking",
        "guest-link-daily",
        linkKey,
        guestEmailHash,
      ]),
      ...PUBLIC_BOOKING_RATE_LIMITS.guestLinkDaily,
    },
    {
      id: "link-hourly",
      key: createRateLimitKey([
        "rate-limit",
        "public-booking",
        "link-hourly",
        linkKey,
      ]),
      ...PUBLIC_BOOKING_RATE_LIMITS.linkHourly,
    },
    {
      id: "link-daily",
      key: createRateLimitKey([
        "rate-limit",
        "public-booking",
        "link-daily",
        linkKey,
      ]),
      ...PUBLIC_BOOKING_RATE_LIMITS.linkDaily,
    },
  ];

  for (const rule of rules) {
    const result = await checkRateLimit({ rule, logger });
    if (result.limited) {
      logger.warn("Public booking rate limit exceeded", {
        rateLimitId: rule.id,
        limit: result.limit,
        retryAfterSeconds: result.retryAfterSeconds,
      });
      throw new SafeError(
        "Too many booking attempts. Please try again later.",
        429,
      );
    }
  }
}
