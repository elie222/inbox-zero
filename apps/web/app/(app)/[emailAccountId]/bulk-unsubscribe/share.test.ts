import { describe, expect, it } from "vitest";
import {
  buildCelebrationSubline,
  buildLinkedInShareUrl,
  buildShareText,
  buildXShareUrl,
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

describe("buildCelebrationSubline", () => {
  it("phrases known preset ranges as relative periods", () => {
    const to = new Date(2026, 5, 12);
    const from = new Date(2026, 2, 14); // 90 days earlier
    expect(
      buildCelebrationSubline({ emailCount: 384, dateRange: { from, to } }),
    ).toBe("That's 384 emails over the last 3 months you won't get again.");
  });

  it("falls back to a start date for custom ranges", () => {
    const from = new Date(2026, 0, 5);
    const to = new Date(2026, 1, 1);
    expect(
      buildCelebrationSubline({ emailCount: 10, dateRange: { from, to } }),
    ).toBe("That's 10 emails since Jan 5, 2026 you won't get again.");
  });

  it("omits the time period when no date range is set", () => {
    expect(buildCelebrationSubline({ emailCount: 1 })).toBe(
      "That's 1 email you won't get again.",
    );
  });

  it("formats large counts with separators", () => {
    expect(buildCelebrationSubline({ emailCount: 1234 })).toBe(
      "That's 1,234 emails you won't get again.",
    );
  });
});
