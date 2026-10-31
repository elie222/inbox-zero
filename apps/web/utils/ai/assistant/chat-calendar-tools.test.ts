import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { createCalendarEvent } from "@/utils/calendar/event-writer";
import { SafeError } from "@/utils/error";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import { createCalendarEventTool } from "./chat-calendar-tools";

vi.mock("@/utils/calendar/event-writer");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const logger = createTestLogger();
const toolOptions = {
  email: "user@example.com",
  emailAccountId: "email-account-1",
  timezone: "America/Los_Angeles",
  logger,
};

describe("createCalendarEventTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCalendarEvent).mockResolvedValue({
      id: "event-1",
      providerCalendarId: "primary",
      eventUrl: "https://calendar.example.com/event-1",
      provider: "google",
      providerConnectionId: "connection-1",
    });
  });

  it("creates a one hour event with no attendees by default", async () => {
    const toolInstance = createCalendarEventTool(toolOptions);

    const result = await (toolInstance.execute as any)({
      title: "Dentist",
      startTime: "2026-03-18T15:00:00-07:00",
    });

    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-1",
        title: "Dentist",
        startTime: new Date("2026-03-18T22:00:00.000Z"),
        endTime: new Date("2026-03-18T23:00:00.000Z"),
        timezone: "America/Los_Angeles",
        attendees: [],
        locationType: BookingLinkLocationType.CUSTOM,
        locationValue: null,
      }),
    );
    expect(result).toEqual({
      success: true,
      message: 'Added "Dentist" to your calendar.',
      event: {
        id: "event-1",
        title: "Dentist",
        startTime: "2026-03-18T22:00:00.000Z",
        endTime: "2026-03-18T23:00:00.000Z",
        timezone: "America/Los_Angeles",
        location: null,
        attendees: [],
        eventUrl: "https://calendar.example.com/event-1",
      },
    });
  });

  it("reads a start time without an offset in the user's timezone", async () => {
    const toolInstance = createCalendarEventTool(toolOptions);

    await (toolInstance.execute as any)({
      title: "School play",
      startTime: "2026-12-01T18:30:00",
      endTime: "2026-12-01T20:00",
    });

    // December is PST (UTC-8); a server-local reading would be off by hours.
    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: new Date("2026-12-02T02:30:00.000Z"),
        endTime: new Date("2026-12-02T04:00:00.000Z"),
      }),
    );
  });

  it("passes location, description and explicitly named attendees", async () => {
    const toolInstance = createCalendarEventTool(toolOptions);

    await (toolInstance.execute as any)({
      title: "Lunch",
      startTime: "2026-03-18T12:00:00-07:00",
      endTime: "2026-03-18T13:00:00-07:00",
      description: "Table for two",
      location: "Cafe on Main St",
      attendees: ["guest@example.com"],
    });

    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Table for two",
        locationValue: "Cafe on Main St",
        attendees: [{ email: "guest@example.com" }],
      }),
    );
  });

  it("rejects an end time that is not after the start time without writing", async () => {
    const toolInstance = createCalendarEventTool(toolOptions);

    const result = await (toolInstance.execute as any)({
      title: "Backwards",
      startTime: "2026-03-18T15:00:00-07:00",
      endTime: "2026-03-18T14:00:00-07:00",
    });

    expect(result).toEqual({ error: "endTime must be after startTime." });
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });

  it("rejects an unparseable start time without writing", async () => {
    const toolInstance = createCalendarEventTool(toolOptions);

    const result = await (toolInstance.execute as any)({
      title: "Sometime",
      startTime: "next Tuesday",
    });

    expect(result).toEqual({
      error: "startTime must be a valid ISO 8601 date-time.",
    });
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });

  it("surfaces a safe provider error and hides unexpected ones", async () => {
    const toolInstance = createCalendarEventTool(toolOptions);
    const input = {
      title: "Dentist",
      startTime: "2026-03-18T15:00:00-07:00",
    };

    vi.mocked(createCalendarEvent).mockRejectedValueOnce(
      new SafeError("Destination calendar not found"),
    );
    expect(await (toolInstance.execute as any)(input)).toEqual({
      error: "Destination calendar not found",
    });

    vi.mocked(createCalendarEvent).mockRejectedValueOnce(
      new Error("socket hang up: internal detail"),
    );
    expect(await (toolInstance.execute as any)(input)).toEqual({
      error: "Failed to create calendar event.",
    });
  });
});
