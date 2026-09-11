import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBookingLinkMetadata } from "@/utils/booking/public";
import { SafeError } from "@/utils/error";
import { BookingPageClient } from "./BookingPageClient";
import { buildBookingLinkPageMetadata } from "./metadata";

const getCachedPublicBookingLinkMetadata = cache(getPublicBookingLinkMetadata);

type BookingLinkPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: BookingLinkPageProps): Promise<Metadata> {
  const { slug } = await params;
  const bookingLink = await getBookingLinkOrNull(slug);

  if (!bookingLink) {
    return {
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return buildBookingLinkPageMetadata(bookingLink);
}

export default async function BookingLinkPage({
  params,
}: BookingLinkPageProps) {
  const { slug } = await params;
  const bookingLink = await getBookingLinkOrNull(slug);

  if (!bookingLink) notFound();

  return <BookingPageClient bookingLink={bookingLink} />;
}

async function getBookingLinkOrNull(slug: string) {
  return getCachedPublicBookingLinkMetadata(slug).catch((error: unknown) => {
    // Only swallow the explicit "not found" path; any other failure
    // (DB outage, provider error, etc.) should surface so it isn't masked
    // as a missing booking link.
    if (error instanceof SafeError && error.statusCode === 404) return null;
    throw error;
  });
}
