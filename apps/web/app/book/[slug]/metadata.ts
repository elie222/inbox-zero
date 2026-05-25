import type { Metadata } from "next";
import { BRAND_NAME, toAbsoluteUrl } from "@/utils/branding";

type BookingLinkMetadata = {
  slug: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  hostName: string | null;
};

export function buildBookingLinkPageMetadata(
  bookingLink: BookingLinkMetadata,
): Metadata {
  const title = buildBookingLinkTitle(bookingLink);
  const description = buildBookingLinkDescription(bookingLink);
  const canonicalUrl = getBookingLinkUrl(bookingLink.slug);
  const imageUrl = getBookingLinkImageUrl(bookingLink.slug);
  const twitterImageUrl = getBookingLinkTwitterImageUrl(bookingLink.slug);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: BRAND_NAME,
      type: "website",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [twitterImageUrl],
    },
  };
}

export function buildBookingLinkTitle(bookingLink: BookingLinkMetadata) {
  const title = bookingLink.title.trim() || "Meeting";
  const hostName = bookingLink.hostName?.trim();

  return `${title} | ${hostName || BRAND_NAME}`;
}

export function buildBookingLinkDescription(bookingLink: BookingLinkMetadata) {
  const description = bookingLink.description?.trim();
  if (description) return description;

  return `${bookingLink.durationMinutes} min meeting`;
}

function getBookingLinkUrl(slug: string) {
  return toAbsoluteUrl(`/book/${encodeURIComponent(slug)}`);
}

function getBookingLinkImageUrl(slug: string) {
  return toAbsoluteUrl(`/book/${encodeURIComponent(slug)}/opengraph-image`);
}

function getBookingLinkTwitterImageUrl(slug: string) {
  return toAbsoluteUrl(`/book/${encodeURIComponent(slug)}/twitter-image`);
}
