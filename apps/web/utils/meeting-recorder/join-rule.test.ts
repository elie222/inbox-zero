import { describe, expect, it } from "vitest";
import { MeetingJoinRule } from "@/generated/prisma/enums";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import { shouldAutoJoin } from "@/utils/meeting-recorder/join-rule";

const USER_EMAIL = "user@acme.com";

describe("shouldAutoJoin", () => {
  it("joins every video meeting under ALL", () => {
    expect(
      shouldAutoJoin({
        event: event({ attendees: [{ email: USER_EMAIL }] }),
        rule: MeetingJoinRule.ALL,
        userEmail: USER_EMAIL,
      }),
    ).toBe(true);
  });

  it("only joins meetings with guests outside the user's domain under EXTERNAL_ONLY", () => {
    const internalOnly = event({
      attendees: [{ email: USER_EMAIL }, { email: "colleague@acme.com" }],
    });
    const withExternal = event({
      attendees: [{ email: USER_EMAIL }, { email: "guest@other.com" }],
    });

    expect(
      shouldAutoJoin({
        event: internalOnly,
        rule: MeetingJoinRule.EXTERNAL_ONLY,
        userEmail: USER_EMAIL,
      }),
    ).toBe(false);
    expect(
      shouldAutoJoin({
        event: withExternal,
        rule: MeetingJoinRule.EXTERNAL_ONLY,
        userEmail: USER_EMAIL,
      }),
    ).toBe(true);
  });

  it("treats the user as host under HOST_ONLY when the calendar flags them or the organizer email matches", () => {
    expect(
      shouldAutoJoin({
        event: event({ isOrganizer: true }),
        rule: MeetingJoinRule.HOST_ONLY,
        userEmail: USER_EMAIL,
      }),
    ).toBe(true);

    // The connected calendar belongs to a different address than the email
    // account, so `isOrganizer` is false even though the user is the host.
    expect(
      shouldAutoJoin({
        event: event({ isOrganizer: false, organizerEmail: "User@Acme.com" }),
        rule: MeetingJoinRule.HOST_ONLY,
        userEmail: USER_EMAIL,
      }),
    ).toBe(true);

    expect(
      shouldAutoJoin({
        event: event({
          isOrganizer: false,
          organizerEmail: "someone@other.com",
        }),
        rule: MeetingJoinRule.HOST_ONLY,
        userEmail: USER_EMAIL,
      }),
    ).toBe(false);
  });

  it("never joins on its own under OFF", () => {
    expect(
      shouldAutoJoin({
        event: event({ attendees: [{ email: "guest@other.com" }] }),
        rule: MeetingJoinRule.OFF,
        userEmail: USER_EMAIL,
      }),
    ).toBe(false);
  });

  it("lets a per-meeting override win over the rule in both directions", () => {
    expect(
      shouldAutoJoin({
        event: event({ attendees: [{ email: "guest@other.com" }] }),
        rule: MeetingJoinRule.EXTERNAL_ONLY,
        userEmail: USER_EMAIL,
        joinOverride: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoJoin({
        event: event(),
        rule: MeetingJoinRule.OFF,
        userEmail: USER_EMAIL,
        joinOverride: true,
      }),
    ).toBe(true);
  });

  it("skips meetings without a video conference link", () => {
    expect(
      shouldAutoJoin({
        event: event({ videoConferenceLink: undefined }),
        rule: MeetingJoinRule.ALL,
        userEmail: USER_EMAIL,
      }),
    ).toBe(false);
  });
});

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-id",
    title: "Sync",
    startTime: new Date("2026-05-04T09:00:00.000Z"),
    endTime: new Date("2026-05-04T09:30:00.000Z"),
    attendees: [],
    videoConferenceLink: "https://meet.google.com/abc-defg-hij",
    ...overrides,
  };
}
