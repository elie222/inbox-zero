import { describe, expect, it } from "vitest";
import { findVideoConferenceLink } from "@/utils/calendar/video-conference-link";

describe("findVideoConferenceLink", () => {
  it("does not treat an unrelated event URL as a video conference", () => {
    expect(
      findVideoConferenceLink(
        "Agenda: https://docs.example.com/customer-call",
        "Location: https://maps.example.com/office",
      ),
    ).toBeUndefined();
  });

  it("decodes HTML entities in a conference URL", () => {
    expect(
      findVideoConferenceLink(
        '<a href="https://zoom.us/j/8123456789?pwd=secret&amp;from=calendar">Join</a>',
      ),
    ).toBe("https://zoom.us/j/8123456789?pwd=secret&from=calendar");
  });
});
