import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount, getMockEmailProvider } from "@/__tests__/helpers";
import type { AutomationCheckInEmailAccount } from "@/utils/ai/automation-jobs/generate-check-in-message";
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
const emailAccount: AutomationCheckInEmailAccount = {
  ...getEmailAccount({
    email: "user@example.com",
    about: "Founder managing a high-volume inbox",
    user: {
      aiProvider: "openai",
      aiModel: "gpt-5.1",
      aiApiKey: null,
    },
  }),
  name: "Test User",
};

describe("getAutomationJobMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses an LLM-generated message when a custom prompt is set", async () => {
    mockAiGenerateAutomationCheckInMessage.mockResolvedValueOnce(
      "Three urgent client emails need your review. Want to triage them now?",
    );

    const emailProvider = getMockEmailProvider({
      unread: 3,
      total: 12,
    });

    const message = await getAutomationJobMessage({
      prompt: "Only include urgent client messages.",
      emailProvider,
      emailAccount,
      logger,
    });

    expect(message).toBe(
      "Three urgent client emails need your review. Want to triage them now?",
    );
    expect(mockAiGenerateAutomationCheckInMessage).toHaveBeenCalledTimes(1);
    expect(mockAiGenerateAutomationCheckInMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        logger,
      }),
    );
  });

  it("falls back to the custom prompt if custom prompt generation fails", async () => {
    mockAiGenerateAutomationCheckInMessage.mockRejectedValueOnce(
      new Error("LLM unavailable"),
    );

    const emailProvider = getMockEmailProvider({
      unread: 5,
      total: 20,
    });

    const message = await getAutomationJobMessage({
      prompt: "Focus on priorities.",
      emailProvider,
      emailAccount,
      logger,
    });

    expect(message).toBe("Focus on priorities.");
    expect(mockAiGenerateAutomationCheckInMessage).toHaveBeenCalledTimes(1);
  });

  it("uses the non-LLM fallback flow when no custom prompt is provided", async () => {
    const emailProvider = getMockEmailProvider({
      unread: 0,
      total: 4,
    });

    const message = await getAutomationJobMessage({
      prompt: null,
      emailProvider,
      emailAccount,
      logger,
    });

    expect(message).toBe(
      "Your inbox looks clear right now. Want me to keep monitoring and ping again later?",
    );
    expect(mockAiGenerateAutomationCheckInMessage).not.toHaveBeenCalled();
  });
});
