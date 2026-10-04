import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFastmailCalendarClient,
  FastmailCalendarProvider,
  parseFastmailCalendarEvents,
} from "./fastmail";
import { parseCalendarInvitation } from "@/utils/calendar/invitations/parser";
import prisma from "@/utils/__mocks__/prisma";

const dav = vi.hoisted(() => ({
  createDAVClient: vi.fn(),
  fetchCalendarObjects: vi.fn(),
  updateCalendarObject: vi.fn(),
  deleteCalendarObject: vi.fn(),
  createCalendarObject: vi.fn(),
}));
vi.mock("tsdav", () => ({ createDAVClient: dav.createDAVClient }));
vi.mock("@/utils/prisma");
const calendarId =
  "https://caldav.fastmail.com/dav/calendars/user/person@example.com/personal/";
const objectUrl = `${calendarId}event.ics`;
const provider = new FastmailCalendarProvider({
  email: "person@example.com",
  appPassword: "test-password",
  connectionId: "connection",
  emailAccountId: "account",
});
const start = new Date("2026-10-01T00:00:00Z");
const end = new Date("2026-12-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  dav.createDAVClient.mockResolvedValue(dav);
  prisma.calendar.findMany.mockResolvedValue([
    { calendarId, timezone: "America/New_York", isReadOnly: false },
  ] as never);
  dav.updateCalendarObject.mockResolvedValue(
    new Response(null, { status: 204 }),
  );
});

describe("Fastmail CalDAV", () => {
  it("expands floating recurrences across DST without moving local meeting time", () => {
    const events = parseFastmailCalendarEvents(
      object(
        "DTSTART:20261030T090000\r\nDTEND:20261030T100000\r\nRRULE:FREQ=DAILY;COUNT=5",
      ),
      "person@example.com",
      "America/New_York",
      start,
      end,
    );
    expect(events.map(({ event }) => event.startTime.toISOString())).toEqual([
      "2026-10-30T13:00:00.000Z",
      "2026-10-31T13:00:00.000Z",
      "2026-11-01T14:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
      "2026-11-03T14:00:00.000Z",
    ]);
  });

  it("treats all-day events as local calendar days", () => {
    const events = parseFastmailCalendarEvents(
      object("DTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102"),
      "person@example.com",
      "America/New_York",
      start,
      end,
    );
    expect(events[0].event.startTime.toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
    expect(events[0].event.endTime.toISOString()).toBe(
      "2026-11-02T05:00:00.000Z",
    );
  });

  it.each([
    "TRANSP:TRANSPARENT",
    "ATTENDEE;PARTSTAT=DECLINED:mailto:person@example.com",
  ])("keeps %s events visible but not busy", (property) => {
    const events = parseFastmailCalendarEvents(
      object(
        `DTSTART:20261010T120000Z\r\nDTEND:20261010T130000Z\r\n${property}`,
      ),
      "person@example.com",
      "UTC",
      start,
      end,
    );
    expect(events).toHaveLength(1);
    expect(events[0].busy).toBe(false);
  });

  it("rejects DAV requests that could disclose the app password to another host", async () => {
    await createFastmailCalendarClient({
      email: "person@example.com",
      appPassword: "test-password",
    });
    const options = dav.createDAVClient.mock.calls[0][0];
    await expect(
      options.fetch("https://attacker.example/calendar", {}),
    ).rejects.toThrow("Invalid Fastmail calendar URL");
  });

  it("refuses to modify an event belonging to another calendar", async () => {
    const id = Buffer.from(
      JSON.stringify({
        url: "https://caldav.fastmail.com/dav/calendars/other/event.ics",
        uid: "event",
        recurrenceId: null,
      }),
    ).toString("base64url");
    await expect(
      provider.cancelEvent({ calendarId, eventId: id }),
    ).rejects.toThrow("does not belong");
    expect(dav.deleteCalendarObject).not.toHaveBeenCalled();
  });

  it("surfaces ETag conflicts without retrying a write", async () => {
    const data = object(
      "DTSTART:20261010T120000Z\r\nDTEND:20261010T130000Z\r\nORGANIZER:mailto:person@example.com",
    );
    dav.fetchCalendarObjects.mockResolvedValue([data]);
    dav.updateCalendarObject.mockResolvedValue(
      new Response(null, { status: 412 }),
    );
    const [parsed] = parseFastmailCalendarEvents(
      data,
      "person@example.com",
      "UTC",
      start,
      end,
    );
    await expect(
      provider.updateEvent({
        calendarId,
        eventId: parsed.event.id,
        startTime: start,
        endTime: end,
        timezone: "UTC",
      }),
    ).rejects.toThrow("changed in another client");
    expect(dav.updateCalendarObject).toHaveBeenCalledTimes(1);
    expect(dav.updateCalendarObject.mock.calls[0][0].calendarObject.etag).toBe(
      '"version1"',
    );
  });

  it("updates one recurring occurrence without changing the series", async () => {
    const data = object(
      "DTSTART:20261010T120000Z\r\nDTEND:20261010T130000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nORGANIZER:mailto:person@example.com",
    );
    dav.fetchCalendarObjects.mockResolvedValue([data]);
    const events = parseFastmailCalendarEvents(
      data,
      "person@example.com",
      "UTC",
      start,
      end,
    );
    await provider.cancelEvent({ calendarId, eventId: events[1].event.id });
    const updated = dav.updateCalendarObject.mock.calls[0][0].calendarObject;
    const remaining = parseFastmailCalendarEvents(
      updated,
      "person@example.com",
      "UTC",
      start,
      end,
    );
    expect(remaining.map(({ event }) => event.startTime.toISOString())).toEqual(
      ["2026-10-10T12:00:00.000Z", "2026-10-12T12:00:00.000Z"],
    );
    expect(dav.deleteCalendarObject).not.toHaveBeenCalled();
  });

  it("changes only the invited attendee response and preserves the event revision", async () => {
    const data = object(
      "DTSTART:20261010T120000Z\r\nDTEND:20261010T130000Z\r\nORGANIZER:mailto:host@example.com\r\nATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:person@example.com\r\nATTENDEE;PARTSTAT=ACCEPTED:mailto:other@example.com",
    );
    const invitation = parseCalendarInvitation(
      data.data.replace("VERSION:2.0", "VERSION:2.0\r\nMETHOD:REQUEST"),
      "person@example.com",
    );
    if (!invitation) throw new Error("Invalid fixture");
    dav.fetchCalendarObjects.mockResolvedValue([data]);
    const event = await provider.findInvitationEvent(invitation);
    if (!event) throw new Error("Missing event");
    await provider.respondToInvitation(event.id, invitation, "tentative");
    const updated =
      dav.updateCalendarObject.mock.calls[0][0].calendarObject.data;
    expect(updated).toContain("PARTSTAT=TENTATIVE");
    expect(updated).toContain(
      "ATTENDEE;PARTSTAT=ACCEPTED:mailto:other@example.com",
    );
    expect(updated).toContain("SEQUENCE:1");
  });
});

function object(properties: string) {
  return {
    url: objectUrl,
    etag: '"version1"',
    data: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:event\r\nSEQUENCE:1\r\nSUMMARY:Meeting\r\n${properties}\r\nEND:VEVENT\r\nEND:VCALENDAR`,
  };
}
