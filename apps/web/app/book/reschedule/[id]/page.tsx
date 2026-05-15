import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicBookingForManagement } from "@/utils/booking/public";
import { enforcePublicBookingRescheduleRateLimit } from "@/utils/booking/public-rate-limit";
import { createScopedLogger } from "@/utils/logger";
import { getClientIp } from "@/utils/rate-limit";
import { RescheduleBookingClient } from "./RescheduleBookingClient";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

const logger = createScopedLogger("public-booking-reschedule-page");

export default async function RescheduleBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ id }, { token }, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);

  if (!token) notFound();

  await enforcePublicBookingRescheduleRateLimit({
    bookingId: id,
    clientIp: getClientIp(requestHeaders),
    logger,
  });

  const booking = await getPublicBookingForManagement({ id, token });
  if (!booking) notFound();

  return <RescheduleBookingClient booking={booking} bookingToken={token} />;
}
