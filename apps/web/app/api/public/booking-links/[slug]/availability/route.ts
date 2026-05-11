import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import { getPublicAvailability } from "@/utils/booking/public";
import { enforcePublicAvailabilityRateLimit } from "@/utils/booking/public-rate-limit";
import { getClientIp } from "@/utils/rate-limit";

export type GetPublicBookingAvailabilityResponse = {
  slots: Awaited<ReturnType<typeof getPublicAvailability>>;
};

const availabilityQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const GET = withError(
  "public/booking-link-availability",
  async (request, context) => {
    const { slug } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const query = availabilityQuerySchema.parse({
      start: searchParams.get("start"),
      end: searchParams.get("end"),
    });
    await enforcePublicAvailabilityRateLimit({
      slug,
      clientIp: getClientIp(request.headers),
      logger: request.logger,
    });
    const slots = await getPublicAvailability({
      slug,
      start: new Date(query.start),
      end: new Date(query.end),
      logger: request.logger,
    });

    return NextResponse.json({ slots });
  },
);
