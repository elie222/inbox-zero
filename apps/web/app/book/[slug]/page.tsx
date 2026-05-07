import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicBookingLinkMetadata } from "@/utils/booking/public";
import { BookingPageClient, PublicShell } from "./BookingPageClient";

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

  if (bookingLink.eventTypes.length === 1) {
    return (
      <BookingPageClient
        bookingLink={bookingLink}
        eventTypeSlug={bookingLink.eventTypes[0].slug}
      />
    );
  }

  return (
    <PublicShell title={bookingLink.title}>
      <div className="grid gap-3">
        {bookingLink.eventTypes.map((eventType) => (
          <Card key={eventType.slug}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div>
                <h2 className="font-medium">{eventType.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {eventType.durationMinutes} minutes
                </p>
              </div>
              <Link
                href={`/book/${bookingLink.slug}/${eventType.slug}`}
                className="text-sm font-medium text-blue-600 underline"
              >
                Select
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </PublicShell>
  );
}
