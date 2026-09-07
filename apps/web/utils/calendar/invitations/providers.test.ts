import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { GoogleCalendarEventProvider } from "@/utils/calendar/providers/google-events";
import { MicrosoftCalendarEventProvider } from "@/utils/calendar/providers/microsoft-events";
import type { CalendarInvitation } from "@/utils/calendar/invitations/parser";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  patch: vi.fn(),
  api: vi.fn(),
  query: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));
vi.mock("@/utils/calendar/client", () => ({
  getCalendarClientWithRefresh: vi.fn(async () => ({
    events: { list: mocks.list, patch: mocks.patch },
  })),
}));
vi.mock("@/utils/outlook/calendar-client", () => ({
  getCalendarClientWithRefresh: vi.fn(async () => ({ api: mocks.api })),
}));
const params = {
  accessToken: "token",
  refreshToken: "refresh",
  expiresAt: null,
  emailAccountId: "account",
  connectionId: "connection",
};
const invitation: CalendarInvitation = {
  uid: "meeting@example.com",
  organizer: "organizer@example.com",
  attendee: "user@example.com",
  sequence: 2,
  recurrenceId: null,
  recurring: false,
  response: null,
  content: "",
  title: "Meeting",
  start: "2026-10-01T10:00:00Z",
};
const google = new GoogleCalendarEventProvider(params, createTestLogger());
const microsoft = new MicrosoftCalendarEventProvider(
  params,
  createTestLogger(),
);
const event = {
  id: "event",
  sequence: 2,
  organizer: { email: invitation.organizer },
  attendees: [
    { self: true, email: invitation.attendee, responseStatus: "needsAction" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ data: { items: [event] } });
  mocks.api.mockReturnValue({ query: mocks.query, post: mocks.post });
  mocks.query.mockReturnValue({ get: mocks.get });
  mocks.get.mockResolvedValue({
    value: [
      {
        id: "event",
        organizer: { emailAddress: { address: invitation.organizer } },
        attendees: [{ emailAddress: { address: invitation.attendee } }],
        responseStatus: { response: "tentativelyAccepted" },
        singleValueExtendedProperties: [
          {
            id: "Integer {00062002-0000-0000-C000-000000000046} Id 0x8201",
            value: "2",
          },
        ],
      },
    ],
  });
});

describe("Google invitation responses", () => {
  it("finds the series master even when exception instances share its UID", async () => {
    mocks.list
      .mockResolvedValueOnce({
        data: {
          items: [{ ...event, id: "exception", recurringEventId: "event" }],
          nextPageToken: "next",
        },
      })
      .mockResolvedValueOnce({ data: { items: [event] } });
    expect(await google.findInvitationEvent(invitation)).toEqual({
      id: "event",
      response: "needsAction",
    });
  });

  it("does not respond to a cancelled event through the email fallback", async () => {
    mocks.list.mockResolvedValue({
      data: { items: [{ ...event, status: "cancelled" }] },
    });
    await expect(google.findInvitationEvent(invitation)).rejects.toThrow(
      "cancelled",
    );
  });

  it("looks up the invitation by UID and only updates the self attendee", async () => {
    expect(await google.findInvitationEvent(invitation)).toEqual({
      id: "event",
      response: "needsAction",
    });
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ iCalUID: invitation.uid }),
    );
    await google.respondToInvitation("event", invitation, "accepted");
    expect(mocks.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event",
        sendUpdates: "all",
        requestBody: {
          attendeesOmitted: true,
          attendees: [
            { email: invitation.attendee, responseStatus: "accepted" },
          ],
        },
      }),
    );
  });

  it("rejects stale invitations", async () => {
    mocks.list.mockResolvedValue({
      data: { items: [{ ...event, sequence: 3 }] },
    });
    await expect(google.findInvitationEvent(invitation)).rejects.toThrow(
      "latest invitation",
    );
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it.each([
    { ...event, organizer: { email: "other@example.com" } },
    { ...event, attendees: [{ email: invitation.attendee, self: false }] },
  ])("does not match an unrelated event", async (unrelated) => {
    mocks.list.mockResolvedValue({ data: { items: [unrelated] } });
    expect(await google.findInvitationEvent(invitation)).toBeNull();
  });
});

describe("Microsoft invitation responses", () => {
  it("rejects stale Outlook revisions", async () => {
    await expect(
      microsoft.findInvitationEvent({ ...invitation, sequence: 1 }),
    ).rejects.toThrow("latest invitation");
  });

  it("uses email fallback when Outlook cannot verify the revision", async () => {
    const result = await mocks.get();
    result.value[0].singleValueExtendedProperties = undefined;
    mocks.get.mockResolvedValue(result);
    expect(await microsoft.findInvitationEvent(invitation)).toBeNull();
  });

  it("rejects cancelled calendar events", async () => {
    mocks.get.mockResolvedValue({
      value: [{ id: "event", isCancelled: true }],
    });
    await expect(microsoft.findInvitationEvent(invitation)).rejects.toThrow(
      "cancelled",
    );
  });

  it("maps the current RSVP from the matched event", async () => {
    expect(await microsoft.findInvitationEvent(invitation)).toEqual({
      id: "event",
      response: "tentative",
    });
  });

  it.each([
    ["accepted", "accept"],
    ["declined", "decline"],
    ["tentative", "tentativelyAccept"],
  ] as const)("sends %s with organizer notification", async (response, action) => {
    await microsoft.respondToInvitation("event/id", invitation, response);
    expect(mocks.api).toHaveBeenCalledWith(`/me/events/event%2Fid/${action}`);
    expect(mocks.post).toHaveBeenCalledWith({ sendResponse: true });
  });
});

it.each([
  google,
  microsoft,
])("does not treat a recurrence exception as the series master", async (provider) => {
  expect(
    await provider.findInvitationEvent({
      ...invitation,
      recurrenceId: "2026-10-01T10:00:00Z",
    }),
  ).toBeNull();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.api).not.toHaveBeenCalled();
});
