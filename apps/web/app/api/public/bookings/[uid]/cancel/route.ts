import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { publicCancelBookingBody } from "@/utils/actions/booking.validation";
import { cancelPublicBooking } from "@/utils/booking/public";

export type PostPublicCancelBookingResponse = Awaited<
  ReturnType<typeof cancelData>
>;

export const POST = withError(
  "public/booking-cancel",
  async (request, context) => {
    const { uid } = await context.params;
    const body = publicCancelBookingBody.parse(await request.json());
    const result = await cancelData({
      uid,
      token: body.token,
      reason: body.reason,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);

async function cancelData({
  uid,
  token,
  reason,
  logger,
}: {
  uid: string;
  token: string;
  reason?: string;
  logger: Parameters<typeof cancelPublicBooking>[0]["logger"];
}) {
  return cancelPublicBooking({ uid, token, reason, logger });
}
