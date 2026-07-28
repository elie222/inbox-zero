import { describe, expect, it } from "vitest";
import { normalizeMeetingUrl } from "@/utils/recall/normalize-meeting-url";

describe("normalizeMeetingUrl", () => {
  it("treats Google Meet links as equal regardless of case, query and trailing slash", () => {
    const expected = "meet.google.com/abc-defg-hij";

    expect(normalizeMeetingUrl("https://meet.google.com/abc-defg-hij")).toBe(
      expected,
    );
    expect(normalizeMeetingUrl("https://meet.google.com/ABC-DEFG-HIJ/")).toBe(
      expected,
    );
    expect(
      normalizeMeetingUrl("https://meet.google.com/abc-defg-hij?authuser=1"),
    ).toBe(expected);
  });

  it("collapses Zoom links across vanity subdomains, path styles and passwords", () => {
    const expected = "zoom.us/j/8123456789";

    expect(normalizeMeetingUrl("https://zoom.us/j/8123456789")).toBe(expected);
    expect(
      normalizeMeetingUrl("https://acme.zoom.us/j/8123456789?pwd=SeCrEt"),
    ).toBe(expected);
    expect(normalizeMeetingUrl("https://acme.zoom.us/s/8123456789")).toBe(
      expected,
    );
    expect(normalizeMeetingUrl("https://acme.zoom.us/wc/join/8123456789")).toBe(
      expected,
    );
  });

  it("keeps Zoom personal room links distinct from each other", () => {
    expect(normalizeMeetingUrl("https://acme.zoom.us/my/alice?pwd=x")).toBe(
      "acme.zoom.us/my/alice",
    );
    expect(normalizeMeetingUrl("https://acme.zoom.us/my/bob")).toBe(
      "acme.zoom.us/my/bob",
    );
  });

  it("strips the per-invitee context from Teams meetup links", () => {
    const expected =
      "teams.microsoft.com/l/meetup-join/19:meeting_abc123@thread.v2";

    expect(
      normalizeMeetingUrl(
        "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123%40thread.v2/0?context=%7b%22Tid%22%3a%22tenant-one%22%7d",
      ),
    ).toBe(expected);
    expect(
      normalizeMeetingUrl(
        "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123%40thread.v2/0?context=%7b%22Tid%22%3a%22tenant-two%22%7d",
      ),
    ).toBe(expected);
  });

  it("normalizes Teams live meet links", () => {
    expect(
      normalizeMeetingUrl("https://teams.live.com/meet/9312345678901?p=abc"),
    ).toBe("teams.live.com/meet/9312345678901");
  });

  it("falls back to host and path for unknown providers", () => {
    expect(
      normalizeMeetingUrl("https://Example.WebEx.com/Meet/room-1?token=abc"),
    ).toBe("example.webex.com/meet/room-1");
  });

  it("returns a lowercased string for values that are not URLs", () => {
    expect(normalizeMeetingUrl("  Not A URL  ")).toBe("not a url");
    expect(normalizeMeetingUrl("   ")).toBe("");
  });
});
