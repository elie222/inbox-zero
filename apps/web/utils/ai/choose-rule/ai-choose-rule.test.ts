/**
 * Unit tests for plugin integration in aiChooseRule.
 * Tests that plugin classifications are executed and merged with AI classifications.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EmailForLLM } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";

vi.mock("server-only", () => ({}));

vi.mock("@/env", () => ({
  env: {
    FEATURE_PLUGINS_ENABLED: true,
  },
}));

vi.mock("@/lib/plugin-runtime/runtime", () => ({
  pluginRuntime: {
    executeClassifyEmail: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/utils/llms", () => ({
  createGenerateObject: vi.fn(() => vi.fn()),
}));

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    model: "test-model",
    provider: "test-provider",
  })),
}));

vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  }),
}));

vi.mock("@/utils/ai/helpers", () => ({
  getUserInfoPrompt: vi.fn(() => "User info prompt"),
  getUserRulesPrompt: vi.fn(() => "User rules prompt"),
}));

vi.mock("@/utils/stringify-email", () => ({
  stringifyEmail: vi.fn((email) => JSON.stringify(email)),
}));

import { aiChooseRule, mergeClassifications } from "./ai-choose-rule";
import { pluginRuntime } from "@/lib/plugin-runtime/runtime";
import { createGenerateObject } from "@/utils/llms";

describe("aiChooseRule - plugin integration", () => {
  const mockEmail: EmailForLLM = {
    id: "test-email-1",
    threadId: "thread-1",
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

  describe("plugin classification execution", () => {
    it("calls pluginRuntime.executeClassifyEmail with correct parameters", async () => {
      const mockGenerateObject = vi.fn().mockResolvedValue({
        object: {
          reasoning: "Test reasoning",
          ruleName: "Test Rule",
          noMatchFound: false,
        },
      });

      vi.mocked(createGenerateObject).mockReturnValue(mockGenerateObject);

      vi.mocked(pluginRuntime.executeClassifyEmail).mockResolvedValue([
        {
          pluginId: "test-plugin",
          result: {
            label: "important",
            confidence: 0.9,
            metadata: { reason: "Plugin detected importance" },
          },
          executionTimeMs: 123,
        },
      ]);

      const rules = [{ name: "Test Rule", instructions: "Test instructions" }];

      const result = await aiChooseRule({
        email: mockEmail,
        rules,
        emailAccount: mockEmailAccount,
      });

      expect(pluginRuntime.executeClassifyEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockEmail.id,
          subject: mockEmail.subject,
          from: mockEmail.from,
        }),
        expect.objectContaining({
          id: mockEmailAccount.id,
          email: mockEmailAccount.email,
          userId: mockEmailAccount.userId,
        }),
        mockEmailAccount.userId,
      );

      expect(result.pluginClassifications).toHaveLength(1);
      expect(result.pluginClassifications?.[0]).toEqual({
        pluginId: "test-plugin",
        classification: {
          label: "important",
          confidence: 0.9,
          metadata: { reason: "Plugin detected importance" },
        },
        executionTimeMs: 123,
      });
    });

    it("handles plugin errors gracefully without breaking AI classification", async () => {
      const mockGenerateObject = vi.fn().mockResolvedValue({
        object: {
          reasoning: "Test reasoning",
          ruleName: "Test Rule",
          noMatchFound: false,
        },
      });

      vi.mocked(createGenerateObject).mockReturnValue(mockGenerateObject);

      vi.mocked(pluginRuntime.executeClassifyEmail).mockResolvedValue([
        {
          pluginId: "failing-plugin",
          result: null,
          executionTimeMs: 100,
          error: "Plugin execution failed",
        },
      ]);

      const rules = [{ name: "Test Rule", instructions: "Test instructions" }];

      const result = await aiChooseRule({
        email: mockEmail,
        rules,
        emailAccount: mockEmailAccount,
      });

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].rule.name).toBe("Test Rule");
      expect(result.pluginClassifications).toHaveLength(1);
      expect(result.pluginClassifications?.[0].error).toBe(
        "Plugin execution failed",
      );
    });

    it("runs AI and plugin classifications in parallel", async () => {
      let aiEndTime = 0;
      let pluginStartTime = 0;

      const mockGenerateObject = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        aiEndTime = Date.now();
        return {
          object: {
            reasoning: "Test reasoning",
            ruleName: "Test Rule",
            noMatchFound: false,
          },
        };
      });

      vi.mocked(createGenerateObject).mockReturnValue(mockGenerateObject);

      vi.mocked(pluginRuntime.executeClassifyEmail).mockImplementation(
        async () => {
          pluginStartTime = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 50));
          return [];
        },
      );

      const rules = [{ name: "Test Rule", instructions: "Test instructions" }];

      await aiChooseRule({
        email: mockEmail,
        rules,
        emailAccount: mockEmailAccount,
      });

      // plugin should start before AI finishes (running in parallel)
      expect(pluginStartTime).toBeLessThan(aiEndTime);
    });

    it("returns empty plugin classifications when no plugins are enabled", async () => {
      const mockGenerateObject = vi.fn().mockResolvedValue({
        object: {
          reasoning: "Test reasoning",
          ruleName: "Test Rule",
          noMatchFound: false,
        },
      });

      vi.mocked(createGenerateObject).mockReturnValue(mockGenerateObject);

      vi.mocked(pluginRuntime.executeClassifyEmail).mockResolvedValue([]);

      const rules = [{ name: "Test Rule", instructions: "Test instructions" }];

      const result = await aiChooseRule({
        email: mockEmail,
        rules,
        emailAccount: mockEmailAccount,
      });

      expect(result.pluginClassifications).toEqual([]);
    });
  });

  describe("mergeClassifications", () => {
    it("merges plugin labels with core labels", () => {
      const coreLabels = ["important", "work"];
      const pluginResults = [
        {
          pluginId: "plugin-1",
          classification: {
            label: "urgent",
            confidence: 0.9,
          },
          executionTimeMs: 100,
        },
        {
          pluginId: "plugin-2",
          classification: {
            label: "customer",
            confidence: 0.8,
          },
          executionTimeMs: 150,
        },
      ];

      const merged = mergeClassifications(coreLabels, pluginResults);

      expect(merged).toContain("important");
      expect(merged).toContain("work");
      expect(merged).toContain("urgent");
      expect(merged).toContain("customer");
      expect(merged).toHaveLength(4);
    });

    it("filters out low confidence plugin classifications", () => {
      const coreLabels = ["important"];
      const pluginResults = [
        {
          pluginId: "plugin-1",
          classification: {
            label: "high-confidence",
            confidence: 0.9,
          },
          executionTimeMs: 100,
        },
        {
          pluginId: "plugin-2",
          classification: {
            label: "low-confidence",
            confidence: 0.3,
          },
          executionTimeMs: 150,
        },
      ];

      const merged = mergeClassifications(coreLabels, pluginResults, {
        minConfidence: 0.5,
      });

      expect(merged).toContain("important");
      expect(merged).toContain("high-confidence");
      expect(merged).not.toContain("low-confidence");
    });

    it("avoids duplicate labels (case-insensitive)", () => {
      const coreLabels = ["Important", "work"];
      const pluginResults = [
        {
          pluginId: "plugin-1",
          classification: {
            label: "important",
            confidence: 0.9,
          },
          executionTimeMs: 100,
        },
        {
          pluginId: "plugin-2",
          classification: {
            label: "WORK",
            confidence: 0.8,
          },
          executionTimeMs: 150,
        },
      ];

      const merged = mergeClassifications(coreLabels, pluginResults);

      expect(
        merged.filter((l) => l.toLowerCase() === "important"),
      ).toHaveLength(1);
      expect(merged.filter((l) => l.toLowerCase() === "work")).toHaveLength(1);
    });

    it("handles plugin errors gracefully", () => {
      const coreLabels = ["important"];
      const pluginResults = [
        {
          pluginId: "plugin-1",
          classification: {
            label: "urgent",
            confidence: 0.9,
          },
          executionTimeMs: 100,
        },
        {
          pluginId: "plugin-2",
          classification: null,
          executionTimeMs: 150,
          error: "Plugin failed",
        },
      ];

      const merged = mergeClassifications(coreLabels, pluginResults);

      expect(merged).toContain("important");
      expect(merged).toContain("urgent");
      expect(merged).toHaveLength(2);
    });

    it("uses custom minimum confidence threshold", () => {
      const coreLabels = ["important"];
      const pluginResults = [
        {
          pluginId: "plugin-1",
          classification: {
            label: "medium-confidence",
            confidence: 0.7,
          },
          executionTimeMs: 100,
        },
      ];

      const mergedDefault = mergeClassifications(coreLabels, pluginResults);
      expect(mergedDefault).toContain("medium-confidence");

      const mergedHighThreshold = mergeClassifications(
        coreLabels,
        pluginResults,
        { minConfidence: 0.8 },
      );
      expect(mergedHighThreshold).not.toContain("medium-confidence");
    });
  });
});
