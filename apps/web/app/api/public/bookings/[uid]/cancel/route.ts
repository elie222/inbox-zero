import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { publicCancelBookingBody } from "@/utils/actions/booking.validation";
import { cancelPublicBooking } from "@/utils/booking/public";

export type PostPublicCancelBookingResponse = Awaited<
  ReturnType<typeof cancelPublicBooking>
>;

export const POST = withError(
  "public/booking-cancel",
  async (request, context) => {
    const { uid } = await context.params;
    const body = publicCancelBookingBody.parse(await request.json());
    const result = await cancelPublicBooking({
      uid,
      token: body.token,
      reason: body.reason,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);
