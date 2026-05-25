import { headers } from "next/headers";
import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/utils/branding";
import { getPublicBookingLinkMetadata } from "@/utils/booking/public";
import { enforcePublicAvailabilityRateLimit } from "@/utils/booking/public-rate-limit";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { getClientIp } from "@/utils/rate-limit";

const logger = createScopedLogger("public/booking-link-og-image");

export const alt = "Booking link";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const BRAND_BLUE = "#2563eb";
const BRAND_BLUE_DARK = "#1d4ed8";

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
  const hostName = bookingLink?.hostName?.trim() || BRAND_NAME;
  const duration = bookingLink?.durationMinutes ?? null;
  const meetingType = duration ? `${duration} Min Meeting` : "Meeting";
  const headline = bookingLink ? `Meet ${hostName}` : `Meet with ${BRAND_NAME}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background:
          "linear-gradient(135deg, #f8fafc 0%, #eef2ff 60%, #e0e7ff 100%)",
        color: "#0f172a",
        padding: 80,
        fontFamily: "Arial, Helvetica, sans-serif",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 520,
          height: 520,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${BRAND_BLUE}22 0%, transparent 70%)`,
          transform: "translate(30%, -30%)",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, ${BRAND_BLUE_DARK} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(37, 99, 235, 0.25)",
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: -0.5,
            }}
          >
            {BRAND_NAME}
          </div>
        </div>

        <div
          style={{
            fontSize: 36,
            color: "#cbd5e1",
            fontWeight: 300,
            margin: "0 8px",
          }}
        >
          /
        </div>

        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 9999,
            background: "#0f172a",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          {hostName.charAt(0).toUpperCase()}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 88,
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: -2,
            color: "#0f172a",
            maxWidth: 1000,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            fontSize: 44,
            lineHeight: 1.2,
            color: "#475569",
            fontWeight: 500,
          }}
        >
          {meetingType}
        </div>
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
