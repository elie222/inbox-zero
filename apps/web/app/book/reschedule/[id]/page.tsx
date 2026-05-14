import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBookingForManagement } from "@/utils/booking/public";
import { RescheduleBookingClient } from "./RescheduleBookingClient";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RescheduleBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ id }, { key }] = await Promise.all([params, searchParams]);

  if (!key) notFound();

  const booking = await getPublicBookingForManagement({ id, token: key });
  if (!booking) notFound();

  return <RescheduleBookingClient booking={booking} bookingKey={key} />;
}
