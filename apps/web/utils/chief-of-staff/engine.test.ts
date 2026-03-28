// apps/web/utils/chief-of-staff/engine.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { processEmailWithClaude } from "./engine";
import {
  CosCategory,
  Venture,
  type EmailMetadata,
  DEFAULT_AUTONOMY_LEVELS,
} from "./types";

// Mock the ai module's generateText
vi.mock("ai", () => ({
  generateText: vi.fn(),
  tool: vi.fn((t) => t),
}));

// Mock the system-prompt builder
vi.mock("./system-prompt", () => ({
  buildSystemPrompt: vi.fn(() => "mocked system prompt"),
}));

// Mock the tools module
vi.mock("./tools", () => ({
  createChiefOfStaffTools: vi.fn(() => ({})),
}));

// Mock the Anthropic SDK provider
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn(() => "mock-claude-model")),
}));

const mockEmail: EmailMetadata = {
  messageId: "msg-123",
  threadId: "thread-456",
  from: "client@example.com",
  to: "me@example.com",
  subject: "Schedule a tutoring session",
  date: new Date("2026-03-21T10:00:00Z"),
  labels: ["INBOX"],
  category: null,
  headers: {},
  snippet: "Hi, I'd like to schedule a session next week.",
  body: "Hi, I'd like to schedule a tutoring session next week. Are you available?",
};

const mockToolContext = {
  emailAccountId: "account-abc",
  emailAddress: "me@example.com",
  gmail: {} as any,
  prisma: {} as any,
  calendarAuth: {} as any,
};

const validCosResponse = {
  category: CosCategory.SCHEDULING,
  summary: "Client requesting a tutoring session next week.",
  actionTaken: "Booked session for Monday at 3pm.",
  draft: null,
  needsApproval: false,
  conflicts: [],
  isVip: false,
  vipGroupName: null,
};

describe("processEmailWithClaude", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a parsed CosEngineResponse when Claude responds with valid JSON", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(validCosResponse),
    } as any);

    const result = await processEmailWithClaude({
      email: mockEmail,
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: DEFAULT_AUTONOMY_LEVELS,
      toolContext: mockToolContext,
    });

    expect(result).toEqual(validCosResponse);
    expect(result.category).toBe(CosCategory.SCHEDULING);
    expect(result.needsApproval).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it("calls generateText with the correct model and system prompt", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(validCosResponse),
    } as any);

    await processEmailWithClaude({
      email: mockEmail,
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: DEFAULT_AUTONOMY_LEVELS,
      toolContext: mockToolContext,
    });

    expect(generateText).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs).toHaveProperty("system");
    expect(callArgs).toHaveProperty("messages");
    expect(callArgs).toHaveProperty("tools");
    expect(callArgs).toHaveProperty("maxSteps");
    expect(callArgs.maxSteps).toBe(10);
  });

  it("includes email content in the user message", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(validCosResponse),
    } as any);

    await processEmailWithClaude({
      email: mockEmail,
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: DEFAULT_AUTONOMY_LEVELS,
      toolContext: mockToolContext,
    });

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    const userMessage = callArgs.messages[0];
    expect(userMessage.role).toBe("user");
    expect(userMessage.content).toContain(mockEmail.subject);
    expect(userMessage.content).toContain(mockEmail.from);
  });

  it("throws when Claude returns invalid JSON", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "I processed the email but forgot to return JSON",
    } as any);

    await expect(
      processEmailWithClaude({
        email: mockEmail,
        venture: Venture.SMART_COLLEGE,
        voiceTone: "Warm and professional",
        autonomyLevels: DEFAULT_AUTONOMY_LEVELS,
        toolContext: mockToolContext,
      }),
    ).rejects.toThrow();
  });

  it("handles response with a draft object", async () => {
    const { generateText } = await import("ai");
    const responseWithDraft = {
      ...validCosResponse,
      category: CosCategory.CLIENT_PARENT,
      needsApproval: true,
      draft: {
        to: "client@example.com",
        subject: "Re: Schedule a tutoring session",
        body: "Hi! I would be happy to help.",
        gmailDraftId: "draft-789",
        gmailThreadId: "thread-456",
      },
    };

    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(responseWithDraft),
    } as any);

    const result = await processEmailWithClaude({
      email: mockEmail,
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: DEFAULT_AUTONOMY_LEVELS,
      toolContext: mockToolContext,
    });

    expect(result.draft).not.toBeNull();
    expect(result.draft?.gmailDraftId).toBe("draft-789");
    expect(result.needsApproval).toBe(true);
  });
});
