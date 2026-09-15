import { beforeEach, describe, expect, it, vi } from "vitest";
import { gatherContextForEvent } from "./gather-context";
import { getMockMessage } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

const { getThreadsWithParticipant, createCalendarEventProviders } = vi.hoisted(
  () => ({
    createCalendarEventProviders: vi.fn(),
    getThreadsWithParticipant: vi.fn(),
  }),
);
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(async () => ({ getThreadsWithParticipant })),
}));
vi.mock("@/utils/calendar/event-provider", () => ({
  createCalendarEventProviders,
}));

const logger = createScopedLogger("meeting-context-test");
const guests = Array.from({ length: 8 }, (_, i) => ({
  email: `guest${i}@example.com`,
}));
const options = {
  event: {
    id: "event",
    title: "Project review",
    startTime: new Date(),
    endTime: new Date(),
    attendees: guests,
  },
  emailAccountId: "test-account",
  externalAttendees: guests,
  internalAttendees: [],
  provider: "google",
  logger,
};

beforeEach(() => {
  vi.clearAllMocks();
  createCalendarEventProviders.mockResolvedValue([]);
});

describe("gatherContextForEvent", () => {
  it("includes context from later attendees when earlier attendees have many threads", async () => {
    getThreadsWithParticipant.mockImplementation(async ({ participantEmail }) =>
      Array.from({ length: 3 }, (_, i) => ({
        id: `${participantEmail}-${i}`,
        messages: [getMockMessage({ from: participantEmail })],
      })),
    );
    const result = await gatherContextForEvent(options);
    expect(
      result.emailThreads.some((thread) =>
        thread.id.startsWith(guests[7].email),
      ),
    ).toBe(true);
    expect(result.emailThreads).toHaveLength(10);
  });

  it("includes internal colleagues and retains the newest messages regardless of provider order", async () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({
      ...getMockMessage({ id: `message-${i}` }),
      internalDate: String(Date.UTC(2026, 0, 1, i)),
    })).reverse();
    getThreadsWithParticipant.mockImplementation(
      async ({ participantEmail }) => [{ id: participantEmail, messages }],
    );
    const result = await gatherContextForEvent({
      ...options,
      externalAttendees: [guests[0]],
      internalAttendees: [{ email: "colleague@company.com" }],
    });
    expect(result.emailThreads.map((thread) => thread.id)).toContain(
      "colleague@company.com",
    );
    expect(
      result.emailThreads[0].messages.map((message) => message.id),
    ).toEqual(Array.from({ length: 10 }, (_, i) => `message-${i + 2}`));
  });

  it("balances calendar context by attendee across multiple connected calendars", async () => {
    getThreadsWithParticipant.mockResolvedValue([]);
    createCalendarEventProviders.mockResolvedValue(
      [0, 1].map((calendar) => ({
        fetchEventsWithAttendee: async ({
          attendeeEmail,
        }: {
          attendeeEmail: string;
        }) =>
          Array.from({ length: 3 }, (_, index) => ({
            ...options.event,
            id: `${attendeeEmail}-${calendar}-${index}`,
            attendees: [{ email: attendeeEmail }],
            startTime: new Date(Date.UTC(2026, 0, index + 1)),
          })),
      })),
    );
    const result = await gatherContextForEvent(options);
    expect(result.pastMeetings).toHaveLength(10);
    expect(
      new Set(result.pastMeetings.map((meeting) => meeting.attendees[0].email))
        .size,
    ).toBe(8);
    expect(result.pastMeetings[0].startTime.getTime()).toBeGreaterThanOrEqual(
      result.pastMeetings[9].startTime.getTime(),
    );
  });

  it("returns the same normalized attendee addresses used for retrieval", async () => {
    getThreadsWithParticipant.mockResolvedValue([]);
    const result = await gatherContextForEvent({
      ...options,
      externalAttendees: [{ email: " Partner@Example.com ", name: "Partner" }],
      internalAttendees: [
        { email: " Colleague@Example.org ", name: "Colleague" },
      ],
    });
    expect(result.externalGuests).toEqual([
      { email: "partner@example.com", name: "Partner" },
    ]);
    expect(result.internalTeamMembers).toEqual([
      { email: "colleague@example.org", name: "Colleague" },
    ]);
    expect(
      getThreadsWithParticipant.mock.calls.map(
        ([input]) => input.participantEmail,
      ),
    ).toEqual([
      result.externalGuests[0].email,
      result.internalTeamMembers[0].email,
    ]);
  });

  it("deduplicates shared threads and continues after a participant lookup fails", async () => {
    getThreadsWithParticipant.mockRejectedValueOnce(new Error("Unavailable"));
    getThreadsWithParticipant.mockImplementation(async () => [
      { id: "shared", messages: [getMockMessage()] },
    ]);
    const result = await gatherContextForEvent(options);
    expect(result.emailThreads.map((thread) => thread.id)).toEqual(["shared"]);
  });
});
