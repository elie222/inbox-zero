import { describe, expect, it } from "vitest";
import {
  buildCelebrationSubline,
  buildLinkedInShareUrl,
  buildShareText,
  buildXShareUrl,
  projectYearlyEmails,
} from "./share";

describe("buildShareText", () => {
  it("includes the count and link", () => {
    expect(
      buildShareText({ senderCount: 12, link: "https://www.getinboxzero.com" }),
    ).toBe(
      "I just unsubscribed from 12 email lists with Inbox Zero. https://www.getinboxzero.com",
    );
  });

  it("uses singular wording for one sender", () => {
    expect(
      buildShareText({ senderCount: 1, link: "https://www.getinboxzero.com" }),
    ).toBe(
      "I just unsubscribed from 1 email list with Inbox Zero. https://www.getinboxzero.com",
    );
  });

  it("highlights the projected yearly emails when provided", () => {
    expect(
      buildShareText({
        senderCount: 12,
        link: "https://www.getinboxzero.com",
        yearlyEmails: 2400,
      }),
    ).toBe(
      "I just unsubscribed from 12 email lists with Inbox Zero — that's ~2,400 fewer emails a year. https://www.getinboxzero.com",
    );
  });

  it("treats a zero projection as a provided estimate", () => {
    expect(
      buildShareText({
        senderCount: 1,
        link: "https://www.getinboxzero.com",
        yearlyEmails: 0,
      }),
    ).toBe(
      "I just unsubscribed from 1 email list with Inbox Zero — that's ~0 fewer emails a year. https://www.getinboxzero.com",
    );
  });
});

describe("share intent URLs", () => {
  const params = { senderCount: 5, link: "https://example.com/?ref=abc123" };

  it("builds an X intent URL with the encoded share text", () => {
    const url = buildXShareUrl(params);
    expect(url.startsWith("https://x.com/intent/tweet?text=")).toBe(true);

    const text = new URL(url).searchParams.get("text");
    expect(text).toBe(buildShareText(params));
  });

  it("builds a LinkedIn share URL with the encoded share text", () => {
    const url = buildLinkedInShareUrl(params);
    expect(
      url.startsWith("https://www.linkedin.com/feed/?shareActive=true&text="),
    ).toBe(true);

    const text = new URL(url).searchParams.get("text");
    expect(text).toBe(buildShareText(params));
  });
});

describe("projectYearlyEmails", () => {
  it("annualizes the count from the range length", () => {
    const to = new Date(2026, 5, 12);
    const from = new Date(2026, 2, 14); // 90 days earlier
    // 384 over 90 days ≈ 1557/year, rounded to nearest 100
    expect(
      projectYearlyEmails({ emailCount: 384, dateRange: { from, to } }),
    ).toBe(1600);
  });

  it("rounds mid-size estimates to the nearest ten", () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 0, 31); // 30 days
    // 12 over 30 days = 146/year, rounded to nearest 10
    expect(
      projectYearlyEmails({ emailCount: 12, dateRange: { from, to } }),
    ).toBe(150);
  });

  it("returns null without a usable range or count", () => {
    expect(projectYearlyEmails({ emailCount: 0 })).toBeNull();
    expect(projectYearlyEmails({ emailCount: 10 })).toBeNull();
    const sameDay = new Date(2026, 0, 1);
    expect(
      projectYearlyEmails({
        emailCount: 10,
        dateRange: { from: sameDay, to: sameDay },
      }),
    ).toBeNull();
  });
});

describe("buildCelebrationSubline", () => {
  it("frames the win as projected future emails", () => {
    const to = new Date(2026, 5, 12);
    const from = new Date(2026, 2, 14); // 90 days earlier
    expect(
      buildCelebrationSubline({ emailCount: 384, dateRange: { from, to } }),
    ).toBe("At their current pace, that's about 1,600 fewer emails a year.");
  });

  it("treats a zero projection as a provided estimate", () => {
    const from = new Date(2026, 0, 1);
    const to = new Date(2028, 8, 27); // 1000 days
    expect(
      buildCelebrationSubline({ emailCount: 1, dateRange: { from, to } }),
    ).toBe("At their current pace, that's about 0 fewer emails a year.");
  });

  it("falls back to the raw count when no range is available", () => {
    expect(buildCelebrationSubline({ emailCount: 1234 })).toBe(
      "That's 1,234 emails you won't get again.",
    );
  });

  it("handles a single past email", () => {
    expect(buildCelebrationSubline({ emailCount: 1 })).toBe(
      "That's 1 email you won't get again.",
    );
  });
});
