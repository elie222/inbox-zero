import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { publicRescheduleBookingBody } from "@/utils/actions/booking.validation";
import { reschedulePublicBooking } from "@/utils/booking/public";
import { enforcePublicBookingRescheduleRateLimit } from "@/utils/booking/public-rate-limit";
import { getClientIp } from "@/utils/rate-limit";

export type PostPublicRescheduleBookingResponse = Awaited<
  ReturnType<typeof reschedulePublicBooking>
>;

export const POST = withError(
  "public/booking-reschedule",
  async (request, context) => {
    const { id } = await context.params;
    const body = publicRescheduleBookingBody.parse(await request.json());
    await enforcePublicBookingRescheduleRateLimit({
      bookingId: id,
      clientIp: getClientIp(request.headers),
      logger: request.logger,
    });
    const result = await reschedulePublicBooking({
      id,
      token: body.token,
      startTime: body.startTime,
      guestTimezone: body.timezone,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);
