import { ImageResponse } from "next/og";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { BRAND_NAME } from "@/utils/branding";
import { parseUnsubscribedCount } from "@/app/api/og/unsubscribed/validation";

export const GET = withError("og/unsubscribed", async (request) => {
  const { searchParams } = new URL(request.url);
  const count = parseUnsubscribedCount(searchParams.get("count"));
  if (count === null) throw new SafeError("Invalid count", 400);

  const lists = count === 1 ? "email list" : "email lists";

  return new ImageResponse(
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background:
          "linear-gradient(135deg, #2563eb 0%, #1d4ed8 45%, #4338ca 100%)",
        color: "#ffffff",
        padding: 80,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {/* Decorative glows */}
      <div
        style={{
          position: "absolute",
          top: -160,
          right: -120,
          width: 420,
          height: 420,
          borderRadius: 9999,
          background: "rgba(125, 211, 252, 0.30)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -200,
          left: -120,
          width: 460,
          height: 460,
          borderRadius: 9999,
          background: "rgba(99, 102, 241, 0.35)",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "rgba(255, 255, 255, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="32"
            height="32"
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
        <div style={{ fontSize: 32, fontWeight: 700 }}>{BRAND_NAME}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontSize: 200,
            lineHeight: 1,
            fontWeight: 800,
            letterSpacing: -8,
            color: "#ffffff",
          }}
        >
          {count.toLocaleString("en-US")}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: -1,
          }}
        >
          {`${lists} silenced`}
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 30,
            color: "rgba(255,255,255,0.75)",
          }}
        >
          {`I just cleaned up my inbox with ${BRAND_NAME}`}
        </div>
      </div>

      <div style={{ fontSize: 28, color: "rgba(255,255,255,0.6)" }}>
        getinboxzero.com
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
});
