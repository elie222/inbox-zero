import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBookingLinkMetadata } from "@/utils/booking/public";
import { BookingPageClient } from "../BookingPageClient";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function BookingEventTypePage({
  params,
}: {
  params: Promise<{ eventTypeSlug: string; slug: string }>;
}) {
  const { slug, eventTypeSlug } = await params;
  const bookingLink = await getPublicBookingLinkMetadata(slug).catch(
    () => null,
  );

  if (
    !bookingLink?.eventTypes.some(
      (eventType) => eventType.slug === eventTypeSlug,
    )
  ) {
    notFound();
  }

  return (
    <BookingPageClient
      bookingLink={bookingLink}
      eventTypeSlug={eventTypeSlug}
    />
  );
}
