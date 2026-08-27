import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getRecordedMeetingContext,
  formatRecordedMeetingContextForPrompt,
  type RecordedMeetingContext,
} from "./reply-context";
import prisma from "@/utils/prisma";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/prisma", () => ({
  default: {
    meeting: {
      findMany: vi.fn(),
    },
  },
}));

const logger = createTestLogger();

const summary = {
  overview: "Discussed the Q3 rollout plan.",
  keyDecisions: ["Ship the beta next week"],
  actionItems: [{ description: "Send pricing doc", owner: "Alex" }],
  openQuestions: ["Which regions launch first?"],
  nextSteps: ["Reconvene on Friday"],
};

function createMeetingRow(overrides: Record<string, unknown> = {}) {
  return {
    eventTitle: "Project kickoff",
    startTime: new Date("2026-08-20T10:00:00Z"),
    attendees: [
      { email: "user@example.com" },
      { email: "sender@example.com", name: "Sender" },
    ],
    summary,
    ...overrides,
  };
}

describe("getRecordedMeetingContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns summaries of meetings the recipient attended", async () => {
    vi.mocked(prisma.meeting.findMany).mockResolvedValue([
      createMeetingRow(),
    ] as any);

    const result = await getRecordedMeetingContext({
      emailAccountId: "account-1",
      recipientEmail: "sender@example.com",
      logger,
    });

    expect(result).toEqual([
      {
        eventTitle: "Project kickoff",
        startTime: new Date("2026-08-20T10:00:00Z"),
        summary,
      },
    ]);
  });

  it("excludes meetings the recipient was not part of", async () => {
    vi.mocked(prisma.meeting.findMany).mockResolvedValue([
      createMeetingRow({
        attendees: [
          { email: "user@example.com" },
          { email: "someone-else@example.com" },
        ],
      }),
    ] as any);

    const result = await getRecordedMeetingContext({
      emailAccountId: "account-1",
      recipientEmail: "sender@example.com",
      logger,
    });

    expect(result).toEqual([]);
  });

  it("excludes meetings the recipient declined", async () => {
    vi.mocked(prisma.meeting.findMany).mockResolvedValue([
      createMeetingRow({
        attendees: [
          { email: "user@example.com" },
          { email: "sender@example.com", declined: true },
        ],
      }),
    ] as any);

    const result = await getRecordedMeetingContext({
      emailAccountId: "account-1",
      recipientEmail: "sender@example.com",
      logger,
    });

    expect(result).toEqual([]);
  });

  it("requires every additional recipient to have attended", async () => {
    vi.mocked(prisma.meeting.findMany).mockResolvedValue([
      createMeetingRow(),
    ] as any);

    const result = await getRecordedMeetingContext({
      emailAccountId: "account-1",
      recipientEmail: "sender@example.com",
      additionalRecipients: ["cc-recipient@example.com"],
      logger,
    });

    expect(result).toEqual([]);
  });

  it("matches attendee emails case-insensitively", async () => {
    vi.mocked(prisma.meeting.findMany).mockResolvedValue([
      createMeetingRow({
        attendees: [{ email: "Sender@Example.com " }],
      }),
    ] as any);

    const result = await getRecordedMeetingContext({
      emailAccountId: "account-1",
      recipientEmail: "sender@example.com",
      logger,
    });

    expect(result).toHaveLength(1);
  });

  it("skips meetings whose stored summary no longer parses", async () => {
    vi.mocked(prisma.meeting.findMany).mockResolvedValue([
      createMeetingRow({ summary: { unrelated: true } }),
      createMeetingRow({ eventTitle: "Valid meeting" }),
    ] as any);

    const result = await getRecordedMeetingContext({
      emailAccountId: "account-1",
      recipientEmail: "sender@example.com",
      logger,
    });

    expect(result).toHaveLength(1);
    expect(result[0].eventTitle).toBe("Valid meeting");
  });

  it("caps the number of returned meetings", async () => {
    vi.mocked(prisma.meeting.findMany).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) =>
        createMeetingRow({ eventTitle: `Meeting ${i}` }),
      ) as any,
    );

    const result = await getRecordedMeetingContext({
      emailAccountId: "account-1",
      recipientEmail: "sender@example.com",
      logger,
    });

    expect(result).toHaveLength(3);
  });

  it("returns an empty list when the query fails", async () => {
    vi.mocked(prisma.meeting.findMany).mockRejectedValue(new Error("db down"));

    const result = await getRecordedMeetingContext({
      emailAccountId: "account-1",
      recipientEmail: "sender@example.com",
      logger,
    });

    expect(result).toEqual([]);
  });
});

describe("formatRecordedMeetingContextForPrompt", () => {
  it("returns null when there are no meetings", () => {
    expect(formatRecordedMeetingContextForPrompt([])).toBeNull();
  });

  it("formats the summary sections for the prompt", () => {
    const meetings: RecordedMeetingContext[] = [
      {
        eventTitle: "Project kickoff",
        startTime: new Date("2026-08-20T10:00:00Z"),
        summary,
      },
    ];

    const result = formatRecordedMeetingContextForPrompt(meetings, "UTC");

    expect(result).toContain('"Project kickoff"');
    expect(result).toContain("Overview: Discussed the Q3 rollout plan.");
    expect(result).toContain("Decisions: Ship the beta next week");
    expect(result).toContain("Action items: Send pricing doc (owner: Alex)");
    expect(result).toContain("Open questions: Which regions launch first?");
    expect(result).toContain("Next steps: Reconvene on Friday");
  });

  it("omits empty summary sections", () => {
    const meetings: RecordedMeetingContext[] = [
      {
        eventTitle: "Quick sync",
        startTime: new Date("2026-08-20T10:00:00Z"),
        summary: {
          overview: "Short status check.",
          keyDecisions: [],
          actionItems: [],
          openQuestions: null,
          nextSteps: null,
        },
      },
    ];

    const result = formatRecordedMeetingContextForPrompt(meetings, "UTC");

    expect(result).toContain("Overview: Short status check.");
    expect(result).not.toContain("Decisions:");
    expect(result).not.toContain("Action items:");
    expect(result).not.toContain("Open questions:");
    expect(result).not.toContain("Next steps:");
  });
});
