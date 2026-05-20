import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import {
  getPublicAvailability,
  getPublicBookingAvailabilityExclusion,
} from "@/utils/booking/public";
import { enforcePublicAvailabilityRateLimit } from "@/utils/booking/public-rate-limit";
import { getClientIp } from "@/utils/rate-limit";

export type GetPublicBookingAvailabilityResponse = {
  slots: Awaited<ReturnType<typeof getPublicAvailability>>;
};

const availabilityQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  rescheduleBookingId: z.string().optional(),
  token: z.string().optional(),
});

export const GET = withError(
  "public/booking-link-availability",
  async (request, context) => {
    const { slug } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const query = availabilityQuerySchema.parse({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
      rescheduleBookingId: searchParams.get("rescheduleBookingId") ?? undefined,
      token: searchParams.get("token") ?? undefined,
    });
    await enforcePublicAvailabilityRateLimit({
      slug,
      clientIp: getClientIp(request.headers),
      logger: request.logger,
    });
    const rescheduleExclusion =
      query.rescheduleBookingId && query.token
        ? await getPublicBookingAvailabilityExclusion({
            id: query.rescheduleBookingId,
            token: query.token,
          })
        : null;
    const excludedBooking =
      rescheduleExclusion?.bookingLinkSlug === slug
        ? rescheduleExclusion
        : null;
    const slots = await getPublicAvailability({
      slug,
      start: new Date(query.start),
      end: new Date(query.end),
      excludeBookingId: excludedBooking?.id,
      excludeBusyPeriod: excludedBooking?.providerBusyPeriod,
      logger: request.logger,
    });

    return NextResponse.json({ slots });
  },
);
