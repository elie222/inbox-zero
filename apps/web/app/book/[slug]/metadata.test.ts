import { describe, expect, it, vi } from "vitest";
import {
  buildBookingLinkDescription,
  buildBookingLinkPageMetadata,
  buildBookingLinkTitle,
} from "./metadata";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://app.example.com",
    NEXT_PUBLIC_BRAND_NAME: "Inbox Zero",
  },
}));

describe("booking link metadata", () => {
  it("builds Cal-style social metadata for a public booking link", () => {
    const metadata = buildBookingLinkPageMetadata({
      slug: "intro-call",
      title: "Intro call",
      description: "Talk through fit.",
      durationMinutes: 30,
      hostName: "Host User",
    });

    expect(metadata).toEqual({
      title: "Intro call | Host User",
      description: "Talk through fit.",
      alternates: {
        canonical: "https://app.example.com/book/intro-call",
      },
      robots: {
        index: false,
        follow: false,
      },
      openGraph: {
        title: "Intro call | Host User",
        description: "Talk through fit.",
        url: "https://app.example.com/book/intro-call",
        siteName: "Inbox Zero",
        type: "website",
        images: [
          {
            url: "https://app.example.com/book/intro-call/opengraph-image",
            width: 1200,
            height: 630,
            alt: "Intro call | Host User",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: "Intro call | Host User",
        description: "Talk through fit.",
        images: ["https://app.example.com/book/intro-call/twitter-image"],
      },
    });
  });

  it("falls back to a short booking description when the link has no description", () => {
    const bookingLink = {
      slug: "intro call",
      title: "Intro call",
      description: null,
      durationMinutes: 45,
      hostName: "Host User",
    };

    expect(buildBookingLinkTitle(bookingLink)).toBe("Intro call | Host User");
    expect(buildBookingLinkDescription(bookingLink)).toBe("45 min meeting");

    expect(buildBookingLinkPageMetadata(bookingLink).openGraph).toMatchObject({
      url: "https://app.example.com/book/intro%20call",
      images: [
        {
          url: "https://app.example.com/book/intro%20call/opengraph-image",
        },
      ],
    });
  });

  it("uses the brand when the host name is unavailable", () => {
    const bookingLink = {
      slug: "intro-call",
      title: "Intro call",
      description: " ",
      durationMinutes: 30,
      hostName: null,
    };

    expect(buildBookingLinkTitle(bookingLink)).toBe("Intro call | Inbox Zero");
    expect(buildBookingLinkDescription(bookingLink)).toBe("30 min meeting");
  });
});
