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
  params: Promise<{ uid: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ uid }, { token }] = await Promise.all([params, searchParams]);

  return <CancelBookingClient uid={uid} token={token} />;
}
