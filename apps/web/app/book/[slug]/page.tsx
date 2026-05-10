import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBookingLinkMetadata } from "@/utils/booking/public";
import { BookingPageClient } from "./BookingPageClient";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function BookingLinkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bookingLink = await getPublicBookingLinkMetadata(slug).catch(
    () => null,
  );

  if (!bookingLink) notFound();

  return <BookingPageClient bookingLink={bookingLink} />;
}
