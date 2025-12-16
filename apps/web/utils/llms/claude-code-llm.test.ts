/**
 * Integration tests for Claude Code LLM layer session management.
 *
 * These tests verify that session IDs flow correctly through the LLM layer,
 * ensuring conversation continuity works as expected.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Use vi.hoisted() for mocks that need to be referenced in vi.mock factories
const { mockGenerateText, mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockGenerateObject: vi.fn(),
}));

const { mockGetSession, mockSaveSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSaveSession: vi.fn(),
}));

// Mock the HTTP client
vi.mock("@/utils/llms/claude-code", () => ({
  claudeCodeGenerateText: mockGenerateText,
  claudeCodeGenerateObject: mockGenerateObject,
  ClaudeCodeError: class ClaudeCodeError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

// Mock session management
vi.mock("@/utils/redis/claude-code-session", () => ({
  getClaudeCodeSession: mockGetSession,
  saveClaudeCodeSession: mockSaveSession,
  getWorkflowGroupFromLabel: (label: string) => {
    if (label.startsWith("email-report")) return "report";
    if (label.includes("rules")) return "rules";
    if (label === "Clean") return "clean";
    return "default";
  },
}));

// Mock other dependencies
vi.mock("@/utils/usage", () => ({
  saveAiUsage: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("server-only", () => ({}));

import {
  createClaudeCodeGenerateText,
  createClaudeCodeGenerateObject,
} from "./claude-code-llm";

describe("Claude Code LLM Session Integration", () => {
  const baseOptions = {
    emailAccount: { email: "test@example.com", id: "acc-123" },
    label: "email-report-summary",
    config: {
      baseUrl: "http://localhost:3100",
      timeout: 120_000,
      authKey: "test-key",
    },
    modelName: "claude-code-cli",
    provider: "claudecode",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful response from HTTP client
    mockGenerateText.mockResolvedValue({
      text: "Generated text response",
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      sessionId: "session-new-123",
    });

    mockGenerateObject.mockResolvedValue({
      object: { result: "success" },
      rawText: '{"result":"success"}',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      sessionId: "session-new-456",
    });
  });

  describe("createClaudeCodeGenerateText", () => {
    it("should retrieve existing session before making HTTP call", async () => {
      mockGetSession.mockResolvedValue({
        sessionId: "existing-session-abc",
        lastUsedAt: new Date().toISOString(),
      });
      mockSaveSession.mockResolvedValue(undefined);

      const generateText = createClaudeCodeGenerateText(baseOptions);
      await generateText({ prompt: "Test prompt", system: "System prompt" });

      // Verify session was retrieved with correct workflow group
      expect(mockGetSession).toHaveBeenCalledWith({
        emailAccountId: "acc-123",
        workflowGroup: "report",
      });

      // Verify existing sessionId was passed to HTTP client
      expect(mockGenerateText).toHaveBeenCalledWith(
        baseOptions.config,
        expect.objectContaining({
          sessionId: "existing-session-abc",
        }),
      );
    });

    it("should pass undefined sessionId when no existing session", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      const generateText = createClaudeCodeGenerateText(baseOptions);
      await generateText({ prompt: "Test prompt" });

      expect(mockGenerateText).toHaveBeenCalledWith(
        baseOptions.config,
        expect.objectContaining({
          sessionId: undefined,
        }),
      );
    });

    it("should save returned sessionId after successful call", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      const generateText = createClaudeCodeGenerateText(baseOptions);
      await generateText({ prompt: "Test prompt" });

      expect(mockSaveSession).toHaveBeenCalledWith({
        emailAccountId: "acc-123",
        workflowGroup: "report",
        sessionId: "session-new-123",
      });
    });

    it("should continue when session retrieval fails", async () => {
      mockGetSession.mockRejectedValue(new Error("Redis connection failed"));
      mockSaveSession.mockResolvedValue(undefined);

      const generateText = createClaudeCodeGenerateText(baseOptions);
      const result = await generateText({ prompt: "Test prompt" });

      // Should still succeed with undefined sessionId
      expect(mockGenerateText).toHaveBeenCalledWith(
        baseOptions.config,
        expect.objectContaining({
          sessionId: undefined,
        }),
      );
      expect(result.text).toBe("Generated text response");
    });

    it("should continue when session save fails", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockRejectedValue(new Error("Redis write failed"));

      const generateText = createClaudeCodeGenerateText(baseOptions);
      const result = await generateText({ prompt: "Test prompt" });

      // Should still return result despite save failure
      expect(result.text).toBe("Generated text response");
    });

    it("should use correct workflow group based on label", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      // Test with rules label
      const rulesOptions = { ...baseOptions, label: "Prompt to rules" };
      const generateText = createClaudeCodeGenerateText(rulesOptions);
      await generateText({ prompt: "Test" });

      expect(mockGetSession).toHaveBeenCalledWith({
        emailAccountId: "acc-123",
        workflowGroup: "rules",
      });
    });
  });

  describe("createClaudeCodeGenerateObject", () => {
    const testSchema = z.object({ result: z.string() });

    it("should retrieve existing session before making HTTP call", async () => {
      mockGetSession.mockResolvedValue({
        sessionId: "existing-session-xyz",
        lastUsedAt: new Date().toISOString(),
      });
      mockSaveSession.mockResolvedValue(undefined);

      const generateObject = createClaudeCodeGenerateObject(baseOptions);
      await generateObject({
        prompt: "Test prompt",
        schema: testSchema,
      });

      expect(mockGetSession).toHaveBeenCalledWith({
        emailAccountId: "acc-123",
        workflowGroup: "report",
      });

      expect(mockGenerateObject).toHaveBeenCalledWith(
        baseOptions.config,
        expect.objectContaining({
          sessionId: "existing-session-xyz",
        }),
      );
    });

    it("should save returned sessionId after successful call", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      const generateObject = createClaudeCodeGenerateObject(baseOptions);
      await generateObject({
        prompt: "Test prompt",
        schema: testSchema,
      });

      expect(mockSaveSession).toHaveBeenCalledWith({
        emailAccountId: "acc-123",
        workflowGroup: "report",
        sessionId: "session-new-456",
      });
    });

    it("should continue when session retrieval fails", async () => {
      mockGetSession.mockRejectedValue(new Error("Redis timeout"));
      mockSaveSession.mockResolvedValue(undefined);

      const generateObject = createClaudeCodeGenerateObject(baseOptions);
      const result = await generateObject({
        prompt: "Test prompt",
        schema: testSchema,
      });

      expect(result.object).toEqual({ result: "success" });
    });

    it("should continue when session save fails", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockRejectedValue(new Error("Redis write failed"));

      const generateObject = createClaudeCodeGenerateObject(baseOptions);
      const result = await generateObject({
        prompt: "Test prompt",
        schema: testSchema,
      });

      expect(result.object).toEqual({ result: "success" });
    });
  });

  describe("Session continuity across calls", () => {
    it("should allow session reuse across multiple calls", async () => {
      // First call - no existing session
      mockGetSession.mockResolvedValueOnce(null);
      mockSaveSession.mockResolvedValue(undefined);

      const generateText = createClaudeCodeGenerateText(baseOptions);
      await generateText({ prompt: "First call" });

      // Second call - session exists
      mockGetSession.mockResolvedValueOnce({
        sessionId: "session-new-123",
        lastUsedAt: new Date().toISOString(),
      });

      await generateText({ prompt: "Second call" });

      // Verify second call used the saved session
      expect(mockGenerateText).toHaveBeenNthCalledWith(
        2,
        baseOptions.config,
        expect.objectContaining({
          sessionId: "session-new-123",
        }),
      );
    });
  });
});
