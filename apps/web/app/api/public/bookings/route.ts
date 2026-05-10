import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { publicBookingBody } from "@/utils/actions/booking.validation";
import { createPublicBooking } from "@/utils/booking/public";
import { enforcePublicBookingRateLimit } from "@/utils/booking/public-rate-limit";
import { getClientIp } from "@/utils/rate-limit";

export type PostPublicBookingResponse = Awaited<ReturnType<typeof createData>>;

export const POST = withError("public/bookings", async (request) => {
  const body = publicBookingBody.parse(await request.json());
  await enforcePublicBookingRateLimit({
    input: body,
    clientIp: getClientIp(request.headers),
    logger: request.logger,
  });
  const result = await createData({ body, logger: request.logger });

  return NextResponse.json(result);
});

async function createData({
  body,
  logger,
}: {
  body: ReturnType<typeof publicBookingBody.parse>;
  logger: Parameters<typeof createPublicBooking>[0]["logger"];
}) {
  return createPublicBooking({ input: body, logger });
}
