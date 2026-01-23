/**
 * Unit tests for aiChooseRule.
 * Tests core AI classification functionality.
 *
 * Note: Plugin classification is now handled via capability-based routing
 * in the plugin runtime layer, not at the rule matching level.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EmailForLLM } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/llms", () => ({
  createGenerateObject: vi.fn(() => vi.fn()),
}));

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    model: "test-model",
    provider: "test-provider",
  })),
}));

vi.mock("@/utils/ai/helpers", () => ({
  getUserInfoPrompt: vi.fn(() => "User info prompt"),
  getUserRulesPrompt: vi.fn(() => "User rules prompt"),
}));

vi.mock("@/utils/stringify-email", () => ({
  stringifyEmail: vi.fn((email) => JSON.stringify(email)),
}));

import { aiChooseRule } from "./ai-choose-rule";
import { createGenerateObject } from "@/utils/llms";

describe("aiChooseRule", () => {
  const mockEmail: EmailForLLM = {
    id: "test-email-1",
    subject: "Test Email",
    from: "sender@example.com",
    to: "user@example.com",
    content: "This is a test email",
    date: new Date("2024-01-01"),
  };

  const mockEmailAccount: EmailAccountWithAI = {
    id: "account-1",
    email: "user@example.com",
    userId: "user-1",
    account: {
      provider: "google" as const,
    },
    user: {
      aiProvider: "openai",
      aiModel: "gpt-4",
      aiApiKey: "test-key",
    },
    multiRuleSelectionEnabled: false,
  } as EmailAccountWithAI;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("core AI classification", () => {
    it("returns matched rule when AI finds a match", async () => {
      const mockGenerateObject = vi.fn().mockResolvedValue({
        object: {
          reasoning: "Test reasoning",
          ruleName: "Test Rule",
          noMatchFound: false,
        },
      });

      vi.mocked(createGenerateObject).mockReturnValue(mockGenerateObject);

      const rules = [{ name: "Test Rule", instructions: "Test instructions" }];

      const result = await aiChooseRule({
        email: mockEmail,
        rules,
        emailAccount: mockEmailAccount,
      });

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].rule.name).toBe("Test Rule");
      expect(result.reason).toBe("Test reasoning");
    });

    it("returns empty rules when AI finds no match", async () => {
      const mockGenerateObject = vi.fn().mockResolvedValue({
        object: {
          reasoning: "No matching rule found",
          ruleName: null,
          noMatchFound: true,
        },
      });

      vi.mocked(createGenerateObject).mockReturnValue(mockGenerateObject);

      const rules = [{ name: "Test Rule", instructions: "Test instructions" }];

      const result = await aiChooseRule({
        email: mockEmail,
        rules,
        emailAccount: mockEmailAccount,
      });

      expect(result.rules).toHaveLength(0);
      expect(result.reason).toBe("No matching rule found");
    });

    it("returns early with no rules message when rules array is empty", async () => {
      const result = await aiChooseRule({
        email: mockEmail,
        rules: [],
        emailAccount: mockEmailAccount,
      });

      expect(result.rules).toHaveLength(0);
      expect(result.reason).toBe("No rules to evaluate");
      expect(createGenerateObject).not.toHaveBeenCalled();
    });

    it("matches rule names case-insensitively", async () => {
      const mockGenerateObject = vi.fn().mockResolvedValue({
        object: {
          reasoning: "Test reasoning",
          ruleName: "TEST RULE",
          noMatchFound: false,
        },
      });

      vi.mocked(createGenerateObject).mockReturnValue(mockGenerateObject);

      const rules = [{ name: "test rule", instructions: "Test instructions" }];

      const result = await aiChooseRule({
        email: mockEmail,
        rules,
        emailAccount: mockEmailAccount,
      });

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].rule.name).toBe("test rule");
    });
  });
});
