import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { publicCancelBookingBody } from "@/utils/actions/booking.validation";
import { cancelPublicBooking } from "@/utils/booking/public";
import { enforcePublicBookingCancelRateLimit } from "@/utils/booking/public-rate-limit";
import { getClientIp } from "@/utils/rate-limit";

export type PostPublicCancelBookingResponse = Awaited<
  ReturnType<typeof cancelPublicBooking>
>;

export const POST = withError(
  "public/booking-cancel",
  async (request, context) => {
    const { id } = await context.params;
    const body = publicCancelBookingBody.parse(await request.json());
    await enforcePublicBookingCancelRateLimit({
      bookingId: id,
      clientIp: getClientIp(request.headers),
      logger: request.logger,
    });
    const result = await cancelPublicBooking({
      id,
      token: body.token,
      reason: body.reason,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);
