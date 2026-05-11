import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBookingLinkMetadata } from "@/utils/booking/public";
import { SafeError } from "@/utils/error";
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
    (error: unknown) => {
      // Only swallow the explicit "not found" path; any other failure
      // (DB outage, provider error, etc.) should surface so it isn't masked
      // as a missing booking link.
      if (error instanceof SafeError && error.statusCode === 404) return null;
      throw error;
    },
  );

  if (!bookingLink) notFound();

  return <BookingPageClient bookingLink={bookingLink} />;
}
