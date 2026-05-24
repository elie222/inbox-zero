import { headers } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnforcePublicAvailabilityRateLimit,
  mockGetPublicBookingLinkMetadata,
  mockHeaders,
  mockImageResponse,
  MockImageResponse,
} = vi.hoisted(() => {
  const mockImageResponse = vi.fn();

  return {
    mockEnforcePublicAvailabilityRateLimit: vi.fn(),
    mockGetPublicBookingLinkMetadata: vi.fn(),
    mockHeaders: vi.fn(),
    mockImageResponse,
    MockImageResponse: class extends Response {
      constructor(element: unknown, init?: ResponseInit) {
        mockImageResponse(element, init);
        super("image", {
          headers: init?.headers,
          status: init?.status,
          statusText: init?.statusText,
        });
      }
    },
  };
});

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

vi.mock("next/og", () => ({
  ImageResponse: MockImageResponse,
}));

vi.mock("@/utils/booking/public-rate-limit", () => ({
  enforcePublicAvailabilityRateLimit: mockEnforcePublicAvailabilityRateLimit,
}));

vi.mock("@/utils/booking/public", () => ({
  getPublicBookingLinkMetadata: mockGetPublicBookingLinkMetadata,
}));

import { SafeError } from "@/utils/error";
import Image from "./opengraph-image";

describe("booking link Open Graph image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(
      new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }),
    );
    mockEnforcePublicAvailabilityRateLimit.mockResolvedValue(undefined);
    mockGetPublicBookingLinkMetadata.mockResolvedValue({
      slug: "intro-call",
      title: "Intro call",
      description: "Talk through fit.",
      durationMinutes: 30,
      locationType: "CUSTOM",
      locationValue: null,
      hostName: "Host User",
    });
  });

  it("rate limits before loading booking metadata and caches successful images", async () => {
    const response = await Image({
      params: Promise.resolve({ slug: "intro-call" }),
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("image");
    expect(headers).toHaveBeenCalled();
    expect(mockEnforcePublicAvailabilityRateLimit).toHaveBeenCalledWith({
      slug: "intro-call",
      clientIp: "203.0.113.9",
      logger: expect.any(Object),
    });
    expect(mockGetPublicBookingLinkMetadata).toHaveBeenCalledWith("intro-call");
    expect(mockImageResponse).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        width: 1200,
        height: 630,
        headers: {
          "Cache-Control":
            "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        },
      }),
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    );
  });

  it("does not load booking metadata when rate limited", async () => {
    mockEnforcePublicAvailabilityRateLimit.mockRejectedValue(
      new SafeError("Too many availability checks.", 429),
    );

    const response = await Image({
      params: Promise.resolve({ slug: "intro-call" }),
    });

    expect(response.status).toBe(429);
    await expect(response.text()).resolves.toBe(
      "Too many availability checks.",
    );
    expect(mockGetPublicBookingLinkMetadata).not.toHaveBeenCalled();
    expect(mockImageResponse).not.toHaveBeenCalled();
  });
});
