import type { Metadata } from "next";
import { CancelBookingClient } from "./CancelBookingClient";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CancelBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ id }, { key }] = await Promise.all([params, searchParams]);

  return <CancelBookingClient id={id} bookingKey={key} />;
}
