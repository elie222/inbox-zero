/**
 * Integration tests for Claude Code LLM layer session management.
 *
 * These tests verify that session IDs flow correctly through the LLM layer,
 * ensuring conversation continuity works as expected.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Use vi.hoisted() for mocks that need to be referenced in vi.mock factories
const { mockGenerateText, mockGenerateObject, mockStreamText } = vi.hoisted(
  () => ({
    mockGenerateText: vi.fn(),
    mockGenerateObject: vi.fn(),
    mockStreamText: vi.fn(),
  }),
);

const { mockGetSession, mockSaveSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSaveSession: vi.fn(),
}));

// Mock the HTTP client
vi.mock("@/utils/llms/claude-code", () => ({
  claudeCodeGenerateText: mockGenerateText,
  claudeCodeGenerateObject: mockGenerateObject,
  claudeCodeStreamText: mockStreamText,
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
  createClaudeCodeStreamText,
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
        userEmail: "test@example.com",
        workflowGroup: "report",
      });

      // Verify existing sessionId was passed to HTTP client
      // Note: config gets model added from getModelForLabel()
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: baseOptions.config.baseUrl,
          authKey: baseOptions.config.authKey,
        }),
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

      // Note: config gets model added from getModelForLabel()
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: baseOptions.config.baseUrl,
          authKey: baseOptions.config.authKey,
        }),
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
        userEmail: "test@example.com",
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
      // Note: config gets model added from getModelForLabel()
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: baseOptions.config.baseUrl,
          authKey: baseOptions.config.authKey,
        }),
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
        userEmail: "test@example.com",
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
        userEmail: "test@example.com",
        workflowGroup: "report",
      });

      // Note: config gets model added from getModelForLabel()
      expect(mockGenerateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: baseOptions.config.baseUrl,
          authKey: baseOptions.config.authKey,
        }),
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
        userEmail: "test@example.com",
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
      // Note: config gets model added from getModelForLabel()
      expect(mockGenerateText).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          baseUrl: baseOptions.config.baseUrl,
          authKey: baseOptions.config.authKey,
        }),
        expect.objectContaining({
          sessionId: "session-new-123",
        }),
      );
    });
  });

  describe("createClaudeCodeStreamText", () => {
    /**
     * Helper to create a mock streaming result from the HTTP client.
     * Simulates the shape returned by claudeCodeStreamText.
     */
    function createMockStreamResult(options: {
      textChunks?: string[];
      sessionId?: string;
      usage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      };
    }) {
      const {
        textChunks = ["Hello", " world"],
        sessionId = "stream-session-123",
        usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      } = options;

      let chunkIndex = 0;

      return {
        textStream: new ReadableStream<string>({
          pull(controller) {
            if (chunkIndex < textChunks.length) {
              controller.enqueue(textChunks[chunkIndex]);
              chunkIndex++;
            } else {
              controller.close();
            }
          },
        }),
        sessionId: Promise.resolve(sessionId),
        usage: Promise.resolve(usage),
        text: Promise.resolve(textChunks.join("")),
      };
    }

    beforeEach(() => {
      // Default successful streaming response
      mockStreamText.mockResolvedValue(createMockStreamResult({}));
    });

    it("should retrieve existing session before starting stream", async () => {
      mockGetSession.mockResolvedValue({
        sessionId: "existing-stream-session",
        lastUsedAt: new Date().toISOString(),
      });
      mockSaveSession.mockResolvedValue(undefined);

      const result = await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "email-report-summary",
        config: baseOptions.config,
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
      });

      // Verify session was retrieved
      expect(mockGetSession).toHaveBeenCalledWith({
        userEmail: "test@example.com",
        workflowGroup: "report",
      });

      // Verify existing sessionId was passed to HTTP client
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sessionId: "existing-stream-session",
        }),
      );

      // Consume stream to complete
      for await (const _ of result.textStream) {
        /* consume */
      }
    });

    it("should save sessionId after stream completes", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      const result = await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "email-report-summary",
        config: baseOptions.config,
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [{ role: "user", content: "Test" }],
      });

      // Consume stream to trigger completion
      await result.text;

      // Wait for async session save
      await new Promise((r) => setTimeout(r, 10));

      expect(mockSaveSession).toHaveBeenCalledWith({
        userEmail: "test@example.com",
        workflowGroup: "report",
        sessionId: "stream-session-123",
      });
    });

    it("should return AsyncIterable textStream", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      mockStreamText.mockResolvedValue(
        createMockStreamResult({
          textChunks: ["Chunk 1", "Chunk 2", "Chunk 3"],
        }),
      );

      const result = await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "default-task",
        config: baseOptions.config,
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [{ role: "user", content: "Test" }],
      });

      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Chunk 1", "Chunk 2", "Chunk 3"]);
    });

    it("should resolve text promise with accumulated content", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      mockStreamText.mockResolvedValue(
        createMockStreamResult({ textChunks: ["Hello", " ", "world", "!"] }),
      );

      const result = await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "default-task",
        config: baseOptions.config,
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [{ role: "user", content: "Test" }],
      });

      const text = await result.text;
      expect(text).toBe("Hello world!");
    });

    it("should resolve usage promise with token counts", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      mockStreamText.mockResolvedValue(
        createMockStreamResult({
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        }),
      );

      const result = await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "default-task",
        config: baseOptions.config,
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [{ role: "user", content: "Test" }],
      });

      const usage = await result.usage;
      expect(usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
    });

    it("should provide toTextStreamResponse method returning HTTP Response", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      mockStreamText.mockResolvedValue(
        createMockStreamResult({ textChunks: ["Stream", "Response"] }),
      );

      const result = await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "default-task",
        config: baseOptions.config,
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [{ role: "user", content: "Test" }],
      });

      const response = result.toTextStreamResponse();

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get("Content-Type")).toBe(
        "text/plain; charset=utf-8",
      );
      expect(response.headers.get("Transfer-Encoding")).toBe("chunked");
    });

    it("should extract system and user content from messages", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "default-task",
        config: baseOptions.config,
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "What is the weather?" },
        ],
      });

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          system: "You are a helpful assistant",
          prompt: "What is the weather?",
        }),
      );
    });

    it("should call onFinish callback when stream completes", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      mockStreamText.mockResolvedValue(
        createMockStreamResult({
          textChunks: ["Complete text"],
          usage: { inputTokens: 25, outputTokens: 15, totalTokens: 40 },
        }),
      );

      const onFinish = vi.fn();

      const result = await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "default-task",
        config: baseOptions.config,
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [{ role: "user", content: "Test" }],
        onFinish,
      });

      // Consume stream to trigger completion
      await result.text;

      // Wait for async callbacks
      await new Promise((r) => setTimeout(r, 10));

      expect(onFinish).toHaveBeenCalledWith({
        text: "Complete text",
        usage: { inputTokens: 25, outputTokens: 15, totalTokens: 40 },
      });
    });

    it("should continue when session retrieval fails", async () => {
      mockGetSession.mockRejectedValue(new Error("Redis connection failed"));
      mockSaveSession.mockResolvedValue(undefined);

      const result = await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "default-task",
        config: baseOptions.config,
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [{ role: "user", content: "Test" }],
      });

      // Should still succeed with undefined sessionId
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sessionId: undefined,
        }),
      );

      const text = await result.text;
      expect(text).toBe("Hello world");
    });

    it("should continue when session save fails", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockRejectedValue(new Error("Redis write failed"));

      const result = await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "default-task",
        config: baseOptions.config,
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [{ role: "user", content: "Test" }],
      });

      // Should still return result despite save failure
      const text = await result.text;
      expect(text).toBe("Hello world");
    });

    it("should use label-based model override", async () => {
      mockGetSession.mockResolvedValue(null);
      mockSaveSession.mockResolvedValue(undefined);

      // Use a label that has a model override (e.g., "Summarize email" -> haiku)
      await createClaudeCodeStreamText({
        emailAccount: baseOptions.emailAccount,
        label: "Summarize email",
        config: { ...baseOptions.config, model: "sonnet" },
        modelName: baseOptions.modelName,
        provider: baseOptions.provider,
        messages: [{ role: "user", content: "Summarize this" }],
      });

      // The config passed to streamText should have "haiku" instead of "sonnet"
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({ model: "haiku" }),
        expect.anything(),
      );
    });
  });
});
