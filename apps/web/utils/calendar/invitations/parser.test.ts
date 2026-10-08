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

const timezone = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Sao_Paulo",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:-0300",
  "TZOFFSETTO:-0300",
  "TZNAME:-03",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

const detailedInvite = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "METHOD:REQUEST",
  timezone,
  "BEGIN:VEVENT",
  "UID:meeting@example.com",
  "SEQUENCE:0",
  "DTSTART;TZID=America/Sao_Paulo:20260929T130000",
  "DTEND;TZID=America/Sao_Paulo:20260929T130500",
  "ORGANIZER:mailto:organizer@example.com",
  "ATTENDEE;CN=Test User;PARTSTAT=NEEDS-ACTION:mailto:user@example.com",
  "ATTENDEE;CN=Guest;PARTSTAT=ACCEPTED;ROLE=OPT-PARTICIPANT:mailto:guest@example.com",
  "LOCATION:Microsoft Teams Meeting",
  "X-GOOGLE-CONFERENCE:https://meet.google.com/ttw-swve-twg",
  "SUMMARY:test rsvp",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("calendar invitation details", () => {
  it("reads the meeting time, place and link", () => {
    const parsed = parseCalendarInvitation(detailedInvite, "user@example.com")!;
    expect(parsed).toMatchObject({
      start: "2026-09-29T16:00:00.000Z",
      end: "2026-09-29T16:05:00.000Z",
      allDay: false,
      location: "Microsoft Teams Meeting",
      conferenceUrl: "https://meet.google.com/ttw-swve-twg",
    });
  });

  // ical.js resolves TZID from the invitation's VTIMEZONE; senders that omit it
  // would otherwise leave the time floating and shift it by the zone's offset.
  it("resolves a named timezone when the invitation omits VTIMEZONE", () => {
    const parsed = parseCalendarInvitation(
      detailedInvite.replace(`${timezone}\r\n`, ""),
      "user@example.com",
    )!;
    expect(parsed.start).toBe("2026-09-29T16:00:00.000Z");
  });

  // A meeting can end in another zone than it starts in, and neither zone need
  // be defined as a VTIMEZONE.
  it("resolves an end that names its own timezone", () => {
    const parsed = parseCalendarInvitation(
      detailedInvite
        .replace(`${timezone}\r\n`, "")
        .replace(
          "DTEND;TZID=America/Sao_Paulo:20260929T130500",
          "DTEND;TZID=Europe/Lisbon:20260929T170500",
        ),
      "user@example.com",
    )!;
    expect(parsed).toMatchObject({
      start: "2026-09-29T16:00:00.000Z",
      end: "2026-09-29T16:05:00.000Z",
    });
  });

  it("keeps an explicit floating end independent of the start timezone", () => {
    const parsed = parseCalendarInvitation(
      detailedInvite
        .replace(`${timezone}\r\n`, "")
        .replace(
          "DTEND;TZID=America/Sao_Paulo:20260929T130500",
          "DTEND:20260929T170500",
        ),
      "user@example.com",
    )!;
    expect(parsed.end).toBe("2026-09-29T17:05:00");
  });

  it("derives the end from a duration", () => {
    const parsed = parseCalendarInvitation(
      detailedInvite.replace(
        "DTEND;TZID=America/Sao_Paulo:20260929T130500",
        "DURATION:PT45M",
      ),
      "user@example.com",
    )!;
    expect(parsed.end).toBe("2026-09-29T16:45:00.000Z");
  });

  it("reads all-day events as plain dates", () => {
    const parsed = parseCalendarInvitation(
      detailedInvite
        .replace(
          "DTSTART;TZID=America/Sao_Paulo:20260929T130000",
          "DTSTART;VALUE=DATE:20260929",
        )
        .replace(
          "DTEND;TZID=America/Sao_Paulo:20260929T130500",
          "DTEND;VALUE=DATE:20260930",
        ),
      "user@example.com",
    )!;
    expect(parsed).toMatchObject({
      start: "2026-09-29",
      end: "2026-09-30",
      allDay: true,
    });
  });

  it("falls back to a conference link in the description", () => {
    const parsed = parseCalendarInvitation(
      detailedInvite.replace(
        "X-GOOGLE-CONFERENCE:https://meet.google.com/ttw-swve-twg",
        "DESCRIPTION:Join here: https://zoom.us/j/8123456789",
      ),
      "user@example.com",
    )!;
    expect(parsed.conferenceUrl).toBe("https://zoom.us/j/8123456789");
  });

  it("finds a join link buried deep in a long description", () => {
    const parsed = parseCalendarInvitation(
      detailedInvite.replace(
        "X-GOOGLE-CONFERENCE:https://meet.google.com/ttw-swve-twg",
        `DESCRIPTION:${"agenda ".repeat(2000)}https://meet.google.com/abc-defg-hij`,
      ),
      "user@example.com",
    )!;
    expect(parsed.conferenceUrl).toBe("https://meet.google.com/abc-defg-hij");
  });

  // Vendors keep inventing X- property names for the join URL, so the parser
  // scans them all instead of listing the ones we happen to know.
  it("finds a join link in a vendor property we do not name", () => {
    const parsed = parseCalendarInvitation(
      detailedInvite.replace(
        "X-GOOGLE-CONFERENCE:https://meet.google.com/ttw-swve-twg",
        "X-MICROSOFT-ONLINEMEETINGCONFLINK:https://teams.microsoft.com/l/meetup-join/abc",
      ),
      "user@example.com",
    )!;
    expect(parsed.conferenceUrl).toBe(
      "https://teams.microsoft.com/l/meetup-join/abc",
    );
  });

  it("ignores a location that is not a conference link", () => {
    const parsed = parseCalendarInvitation(
      detailedInvite.replace(
        "X-GOOGLE-CONFERENCE:https://meet.google.com/ttw-swve-twg",
        "SUMMARY:ignored",
      ),
      "user@example.com",
    )!;
    expect(parsed.conferenceUrl).toBeNull();
    expect(parsed.location).toBe("Microsoft Teams Meeting");
  });
});

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
