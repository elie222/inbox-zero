import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import {
  createCalendarReply,
  parseCalendarInvitation,
} from "@/utils/calendar/invitations/parser";

const invite = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:meeting@example.com",
  "SEQUENCE:2",
  "DTSTAMP:20260901T120000Z",
  "DTSTART:20260910T120000Z",
  "DTEND:20260910T130000Z",
  "ORGANIZER:mailto:organizer@example.com",
  "ATTENDEE;RSVP=TRUE:mailto:user@example.com",
  "ATTENDEE:mailto:guest@example.com",
  "SUMMARY:Team\\, planning",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("calendar invitations", () => {
  it("reads structured invitations and folded attendee properties", () => {
    const result = parseCalendarInvitation(
      invite.replace("mailto:user@example.com", "mailto:user@\r\n example.com"),
      "USER@example.com",
    );
    expect(result).toMatchObject({
      uid: "meeting@example.com",
      title: "Team, planning",
      sequence: 2,
      attendee: "user@example.com",
    });
  });

  it.each([
    "accepted",
    "declined",
    "tentative",
  ] as const)("creates a %s reply for only the responding attendee", (response) => {
    const parsed = parseCalendarInvitation(invite, "user@example.com")!;
    const reply = new ICAL.Component(
      ICAL.parse(createCalendarReply(parsed, response)),
    );
    const event = reply.getFirstSubcomponent("vevent")!;
    expect(reply.getFirstPropertyValue("method")).toBe("REPLY");
    expect(event.getFirstPropertyValue("uid")).toBe(parsed.uid);
    expect(event.getFirstPropertyValue("sequence")).toBe(2);
    expect(event.getAllProperties("attendee")).toHaveLength(1);
    expect(event.getFirstProperty("attendee")?.getParameter("partstat")).toBe(
      response.toUpperCase(),
    );
  });

  it("preserves a recurrence exception identifier and timezone parameters", () => {
    const content = invite.replace(
      "SEQUENCE:2",
      "SEQUENCE:2\r\nRECURRENCE-ID;TZID=Europe/London:20260910T130000",
    );
    const parsed = parseCalendarInvitation(content, "user@example.com")!;
    const reply = new ICAL.Component(
      ICAL.parse(createCalendarReply(parsed, "accepted")),
    );
    expect(
      reply
        .getFirstSubcomponent("vevent")
        ?.getFirstProperty("recurrence-id")
        ?.getParameter("tzid"),
    ).toBe("Europe/London");
  });

  it.each([
    invite.replace("METHOD:REQUEST", "METHOD:CANCEL"),
    invite.replace("METHOD:REQUEST", "METHOD:REPLY"),
    invite.replace("SEQUENCE:2", "SEQUENCE:2\r\nSTATUS:CANCELLED"),
    invite.replace("mailto:user@example.com", "mailto:someone@example.com"),
    invite.replace("mailto:organizer@example.com", "mailto:user@example.com"),
    "invalid calendar",
  ])("does not allow replies to invalid or unrelated requests", (content) => {
    expect(parseCalendarInvitation(content, "user@example.com")).toBeNull();
  });
});
