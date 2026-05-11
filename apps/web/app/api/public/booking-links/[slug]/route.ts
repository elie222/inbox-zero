import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getPublicBookingLinkMetadata } from "@/utils/booking/public";
import { enforcePublicAvailabilityRateLimit } from "@/utils/booking/public-rate-limit";
import { getClientIp } from "@/utils/rate-limit";

export type GetPublicBookingLinkResponse = Awaited<
  ReturnType<typeof getPublicBookingLinkMetadata>
>;

export const GET = withError(
  "public/booking-links",
  async (request, context) => {
    const { slug } = await context.params;
    await enforcePublicAvailabilityRateLimit({
      slug,
      clientIp: getClientIp(request.headers),
      logger: request.logger,
    });
    const result = await getPublicBookingLinkMetadata(slug);

    return NextResponse.json(result);
  },
);
