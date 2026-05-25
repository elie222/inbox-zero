import { headers } from "next/headers";
import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/utils/branding";
import { getPublicBookingLinkMetadata } from "@/utils/booking/public";
import { enforcePublicAvailabilityRateLimit } from "@/utils/booking/public-rate-limit";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { getClientIp } from "@/utils/rate-limit";
import { buildBookingLinkDescription, buildBookingLinkTitle } from "./metadata";

const logger = createScopedLogger("public/booking-link-og-image");

export const alt = "Booking link";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const requestHeaders = await headers();

  try {
    await enforcePublicAvailabilityRateLimit({
      slug,
      clientIp: getClientIp(requestHeaders),
      logger,
    });
  } catch (error) {
    if (error instanceof SafeError && error.statusCode === 429) {
      return new Response(error.safeMessage, { status: 429 });
    }
    throw error;
  }

  const bookingLink = await getBookingLinkOrNull(slug);
  const title = bookingLink
    ? buildBookingLinkTitle(bookingLink)
    : `Meeting | ${BRAND_NAME}`;
  const description = bookingLink
    ? buildBookingLinkDescription(bookingLink)
    : `Book a meeting with ${BRAND_NAME}.`;
  const duration = bookingLink ? `${bookingLink.durationMinutes} min` : null;
  const hostName = bookingLink?.hostName?.trim() || BRAND_NAME;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#f8fafc",
        color: "#111827",
        padding: 72,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 30,
          color: "#334155",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#111827",
              color: "#ffffff",
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            {hostName.charAt(0).toUpperCase()}
          </div>
          <div>{hostName}</div>
        </div>
        {duration ? <div>{duration}</div> : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
        <div
          style={{
            fontSize: 80,
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: 0,
            maxWidth: 960,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 34,
            lineHeight: 1.35,
            color: "#475569",
            maxWidth: 900,
          }}
        >
          {description}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 28,
          color: "#64748b",
        }}
      >
        <div>Booking link</div>
        <div>{BRAND_NAME}</div>
      </div>
    </div>,
    {
      ...size,
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}

async function getBookingLinkOrNull(slug: string) {
  return getPublicBookingLinkMetadata(slug).catch((error: unknown) => {
    if (error instanceof SafeError && error.statusCode === 404) return null;
    throw error;
  });
}
