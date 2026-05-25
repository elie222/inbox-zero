import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { partitionAttendeesForBriefing } from "./attendees";

describe("partitionAttendeesForBriefing", () => {
  it.each([
    "gmail.com",
    "outlook.com",
  ])("treats other %s attendees as external for personal accounts", (domain) => {
    const event = createEvent({
      attendees: [
        { email: `user@${domain}` },
        { email: `guest@${domain}`, name: "Guest" },
      ],
    });

    const { external, internal } = partitionAttendeesForBriefing(
      event,
      `user@${domain}`,
    );

    expect(external).toEqual([{ email: `guest@${domain}`, name: "Guest" }]);
    expect(internal).toEqual([]);
  });

  it("treats same-company-domain attendees as internal team members", () => {
    const event = createEvent({
      attendees: [
        { email: "user@company.com" },
        { email: "teammate@company.com", name: "Teammate" },
        { email: "client@example.com", name: "Client" },
      ],
    });

    const { external, internal } = partitionAttendeesForBriefing(
      event,
      "user@company.com",
    );

    expect(external).toEqual([{ email: "client@example.com", name: "Client" }]);
    expect(internal).toEqual([
      { email: "teammate@company.com", name: "Teammate" },
    ]);
  });

  it("excludes the user from both partitions", () => {
    const event = createEvent({
      attendees: [
        { email: "user@company.com" },
        { email: "USER@company.com" },
        { email: "  user@company.com  " },
      ],
    });

    const { external, internal } = partitionAttendeesForBriefing(
      event,
      "user@company.com",
    );

    expect(external).toEqual([]);
    expect(internal).toEqual([]);
  });
});

function createEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  const startTime = overrides.startTime ?? new Date("2026-05-14T10:00:00Z");
  return {
    id: overrides.id ?? "event-1",
    title: overrides.title ?? "Meeting",
    description: overrides.description,
    location: overrides.location,
    eventUrl: overrides.eventUrl,
    videoConferenceLink: overrides.videoConferenceLink,
    startTime,
    endTime:
      overrides.endTime ?? new Date(startTime.getTime() + 30 * 60 * 1000),
    attendees: overrides.attendees ?? [],
  };
}
