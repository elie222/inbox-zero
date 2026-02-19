import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";

const { mockAiGenerateAutomationCheckInMessage } = vi.hoisted(() => {
  const mockAiGenerateAutomationCheckInMessage = vi.fn();
  return { mockAiGenerateAutomationCheckInMessage };
});

vi.mock("server-only", () => ({}));
vi.mock("@/utils/ai/automation-jobs/generate-check-in-message", () => ({
  aiGenerateAutomationCheckInMessage: mockAiGenerateAutomationCheckInMessage,
}));

import { getAutomationJobMessage } from "./message";

const logger = createScopedLogger("automation-jobs-message-test");

describe("getAutomationJobMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses an LLM-generated message when a custom prompt is set", async () => {
    mockAiGenerateAutomationCheckInMessage.mockResolvedValueOnce(
      "Three urgent client emails need your review. Want to triage them now?",
    );

    const emailProvider = createEmailProviderMock({
      unread: 3,
      total: 12,
    });

    const message = await getAutomationJobMessage({
      prompt: "Only include urgent client messages.",
      emailProvider,
      emailAccount: getEmailAccountForMessage(),
      logger,
    });

    expect(message).toBe(
      "Three urgent client emails need your review. Want to triage them now?",
    );
    expect(mockAiGenerateAutomationCheckInMessage).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default check-in if custom prompt generation fails", async () => {
    mockAiGenerateAutomationCheckInMessage.mockRejectedValueOnce(
      new Error("LLM unavailable"),
    );

    const emailProvider = createEmailProviderMock({
      unread: 5,
      total: 20,
    });

    const message = await getAutomationJobMessage({
      prompt: "Focus on priorities.",
      emailProvider,
      emailAccount: getEmailAccountForMessage(),
      logger,
    });

    expect(message).toBe(
      "You currently have 5 unread emails. Want to go through them now?",
    );
    expect(mockAiGenerateAutomationCheckInMessage).toHaveBeenCalledTimes(1);
  });

  it("uses the non-LLM fallback flow when no custom prompt is provided", async () => {
    const emailProvider = createEmailProviderMock({
      unread: 0,
      total: 4,
    });

    const message = await getAutomationJobMessage({
      prompt: null,
      emailProvider,
      emailAccount: getEmailAccountForMessage(),
      logger,
    });

    expect(message).toBe(
      "Your inbox looks clear right now. Want me to keep monitoring and ping again later?",
    );
    expect(mockAiGenerateAutomationCheckInMessage).not.toHaveBeenCalled();
  });
});

function createEmailProviderMock({
  unread,
  total,
}: {
  unread: number;
  total: number;
}) {
  return {
    getInboxStats: vi.fn().mockResolvedValue({ unread, total }),
    getInboxMessages: vi.fn().mockResolvedValue([]),
  } as Pick<
    EmailProvider,
    "getInboxStats" | "getInboxMessages"
  > as EmailProvider;
}

function getEmailAccountForMessage() {
  return {
    id: "email-account-id",
    userId: "user-id",
    email: "user@example.com",
    name: "Test User",
    about: "Founder managing a high-volume inbox",
    user: {
      aiProvider: "openai",
      aiModel: "gpt-5.1",
      aiApiKey: null,
    },
  };
}
