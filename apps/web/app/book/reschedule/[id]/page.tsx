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
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ id }, { token }] = await Promise.all([params, searchParams]);

  if (!token) notFound();

  const booking = await getPublicBookingForManagement({ id, token });
  if (!booking) notFound();

  return <RescheduleBookingClient booking={booking} token={token} />;
}
