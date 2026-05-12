import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount, createTestLogger } from "@/__tests__/helpers";
import { aiGetCalendarAvailability } from "@/utils/ai/calendar/availability";

const { mockGenerateText, mockCreateGenerateText } = vi.hoisted(() => {
  const mockGenerateText = vi.fn();
  const mockCreateGenerateText = vi.fn(() => mockGenerateText);
  return { mockGenerateText, mockCreateGenerateText };
});

vi.mock("@/utils/llms", () => ({
  createGenerateText: mockCreateGenerateText,
}));

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    provider: "openai",
    modelName: "test-model",
    model: {},
    providerOptions: undefined,
    fallbackModels: [],
  })),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    calendarConnection: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/utils/calendar/unified-availability", () => ({
  getUnifiedCalendarAvailability: vi.fn(),
}));

describe("aiGetCalendarAvailability", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    mockGenerateText.mockImplementation(async ({ tools }) => {
      await tools.returnSuggestedTimes.execute({
        suggestedTimes: [
          {
            start: "2026-05-04 10:30",
            end: "2026-05-04 11:00",
          },
        ],
      });
    });

    const prisma = (await import("@/utils/prisma")).default;
    vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
      {
        calendars: [
          {
            calendarId: "primary",
            timezone: "Europe/London",
            primary: true,
          },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.calendarConnection.findMany>>);
  });

  it("returns the timezone used to generate suggested slots", async () => {
    const result = await aiGetCalendarAvailability({
      emailAccount: {
        ...getEmailAccount(),
        timezone: "America/Los_Angeles",
      },
      messages: [
        {
          id: "msg-1",
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Meeting",
          content: "Can we meet Monday?",
          date: new Date("2026-04-30T08:48:00.000Z"),
        },
      ],
      logger: createTestLogger(),
    });

    expect(result).toEqual({
      timezone: "America/Los_Angeles",
      suggestedTimes: [
        {
          start: "2026-05-04 10:30",
          end: "2026-05-04 11:00",
        },
      ],
    });
  });

  it("tells the model to skip manual availability when a booking link can handle scheduling", async () => {
    await aiGetCalendarAvailability({
      emailAccount: {
        ...getEmailAccount(),
        timezone: "America/Los_Angeles",
      },
      messages: [
        {
          id: "msg-1",
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Call",
          content: "What is the easiest way to book a call?",
          date: new Date("2026-04-30T08:48:00.000Z"),
        },
      ],
      logger: createTestLogger(),
      bookingLinkAvailable: true,
    });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          "The user has a booking link available for scheduling.",
        ),
      }),
    );
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          "do not call checkCalendarAvailability or returnSuggestedTimes",
        ),
      }),
    );
  });
});
