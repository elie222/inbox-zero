/**
 * Tests for Claude Code HTTP client functions.
 *
 * Tests the HTTP client layer that communicates with the Claude Code
 * wrapper service. Covers successful responses, error handling, timeouts,
 * and schema validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import type { ClaudeCodeConfig } from "./model";
import {
  claudeCodeGenerateText,
  claudeCodeGenerateObject,
  ClaudeCodeError,
} from "./claude-code";

// Mock the logger to prevent console noise during tests
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Store original fetch to restore later
const originalFetch = global.fetch;

// Helper to create mock Response objects
function createMockResponse(
  body: unknown,
  options: { status?: number; statusText?: string; ok?: boolean } = {},
): Response {
  const { status = 200, statusText = "OK", ok = true } = options;
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);

  return {
    ok,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(bodyText),
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
    redirected: false,
    type: "basic",
    url: "",
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    bytes: vi.fn(),
  } as unknown as Response;
}

// Default test config
const testConfig: ClaudeCodeConfig = {
  baseUrl: "http://localhost:3100",
  timeout: 30_000,
  authKey: "test-auth-key-12345",
};

describe("Claude Code HTTP Client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Restore original fetch after each test
    global.fetch = originalFetch;
  });

  describe("ClaudeCodeError", () => {
    it("should create error with message and code", () => {
      const error = new ClaudeCodeError("Something went wrong", "TEST_ERROR");

      expect(error.message).toBe("Something went wrong");
      expect(error.code).toBe("TEST_ERROR");
      expect(error.name).toBe("ClaudeCodeError");
      expect(error.rawText).toBeUndefined();
    });

    it("should create error with rawText for debugging", () => {
      const error = new ClaudeCodeError(
        "Parse failed",
        "PARSE_ERROR",
        "raw output from CLI",
      );

      expect(error.message).toBe("Parse failed");
      expect(error.code).toBe("PARSE_ERROR");
      expect(error.rawText).toBe("raw output from CLI");
    });

    it("should be instanceof Error", () => {
      const error = new ClaudeCodeError("test", "TEST");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("claudeCodeGenerateText", () => {
    it("should make POST request with correct headers and body", async () => {
      const mockResponse = createMockResponse({
        text: "Hello, world!",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        sessionId: "session-123",
      });

      const mockFetch = vi.fn().mockResolvedValue(mockResponse);
      global.fetch = mockFetch;

      await claudeCodeGenerateText(testConfig, {
        system: "You are helpful",
        prompt: "Say hello",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe("http://localhost:3100/generate-text");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers.Authorization).toBe("Bearer test-auth-key-12345");

      const body = JSON.parse(options.body);
      expect(body.system).toBe("You are helpful");
      expect(body.prompt).toBe("Say hello");
    });

    it("should return text, usage, and sessionId on success", async () => {
      const mockResponse = createMockResponse({
        text: "Generated response",
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        sessionId: "sess-abc",
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await claudeCodeGenerateText(testConfig, {
        prompt: "Test prompt",
      });

      expect(result.text).toBe("Generated response");
      expect(result.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      });
      expect(result.sessionId).toBe("sess-abc");
    });

    it("should pass sessionId when provided", async () => {
      const mockResponse = createMockResponse({
        text: "Continued response",
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        sessionId: "existing-session",
      });

      const mockFetch = vi.fn().mockResolvedValue(mockResponse);
      global.fetch = mockFetch;

      await claudeCodeGenerateText(testConfig, {
        prompt: "Continue",
        sessionId: "existing-session",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sessionId).toBe("existing-session");
    });

    it("should throw ClaudeCodeError on HTTP 4xx error with error body", async () => {
      const errorResponse = createMockResponse(
        {
          error: "Invalid request parameters",
          code: "INVALID_PARAMS",
        },
        { status: 400, statusText: "Bad Request", ok: false },
      );

      global.fetch = vi.fn().mockResolvedValue(errorResponse);

      await expect(
        claudeCodeGenerateText(testConfig, { prompt: "test" }),
      ).rejects.toMatchObject({
        name: "ClaudeCodeError",
        message: "Invalid request parameters",
        code: "INVALID_PARAMS",
      });
    });

    it("should throw ClaudeCodeError on 401 unauthorized", async () => {
      const errorResponse = createMockResponse(
        { error: "Invalid authentication key", code: "UNAUTHORIZED" },
        { status: 401, statusText: "Unauthorized", ok: false },
      );

      global.fetch = vi.fn().mockResolvedValue(errorResponse);

      await expect(
        claudeCodeGenerateText(testConfig, { prompt: "test" }),
      ).rejects.toMatchObject({
        message: "Invalid authentication key",
        code: "UNAUTHORIZED",
      });
    });

    it("should throw ClaudeCodeError on HTTP 5xx error", async () => {
      const errorResponse = createMockResponse(
        { error: "Internal server error", code: "SERVER_ERROR" },
        { status: 500, statusText: "Internal Server Error", ok: false },
      );

      global.fetch = vi.fn().mockResolvedValue(errorResponse);

      await expect(
        claudeCodeGenerateText(testConfig, { prompt: "test" }),
      ).rejects.toMatchObject({
        message: "Internal server error",
        code: "SERVER_ERROR",
      });
    });

    it("should handle non-JSON error response gracefully", async () => {
      const errorResponse = createMockResponse("Bad Gateway", {
        status: 502,
        statusText: "Bad Gateway",
        ok: false,
      });

      global.fetch = vi.fn().mockResolvedValue(errorResponse);

      await expect(
        claudeCodeGenerateText(testConfig, { prompt: "test" }),
      ).rejects.toMatchObject({
        message: "HTTP 502 Bad Gateway",
        code: "HTTP_ERROR",
      });
    });

    it("should throw ClaudeCodeError when response is not valid JSON", async () => {
      const invalidResponse = createMockResponse("not valid json at all");
      global.fetch = vi.fn().mockResolvedValue(invalidResponse);

      await expect(
        claudeCodeGenerateText(testConfig, { prompt: "test" }),
      ).rejects.toMatchObject({
        message: "Invalid response from Claude Code wrapper: expected JSON",
        code: "INVALID_RESPONSE",
      });
    });

    it("should include timeout signal in fetch call", async () => {
      const mockResponse = createMockResponse({
        text: "response",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        sessionId: "s",
      });

      const mockFetch = vi.fn().mockResolvedValue(mockResponse);
      global.fetch = mockFetch;

      await claudeCodeGenerateText(testConfig, { prompt: "test" });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeDefined();
      // AbortSignal.timeout returns an AbortSignal
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

      await expect(
        claudeCodeGenerateText(testConfig, { prompt: "test" }),
      ).rejects.toThrow("Network failure");
    });

    it("should throw abort error when request times out", async () => {
      const abortError = new DOMException(
        "The operation was aborted.",
        "AbortError",
      );
      global.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(
        claudeCodeGenerateText(testConfig, { prompt: "test" }),
      ).rejects.toThrow("The operation was aborted");
    });

    it("should handle empty text response", async () => {
      const mockResponse = createMockResponse({
        text: "",
        usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
        sessionId: "empty-session",
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await claudeCodeGenerateText(testConfig, {
        prompt: "test",
      });

      expect(result.text).toBe("");
      expect(result.usage.outputTokens).toBe(0);
    });
  });

  describe("claudeCodeGenerateObject", () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean().optional(),
    });

    it("should convert Zod schema to JSON Schema in request", async () => {
      const mockResponse = createMockResponse({
        object: { name: "John", age: 30 },
        rawText: '{"name": "John", "age": 30}',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        sessionId: "session-123",
      });

      const mockFetch = vi.fn().mockResolvedValue(mockResponse);
      global.fetch = mockFetch;

      await claudeCodeGenerateObject(testConfig, {
        prompt: "Generate a person",
        schema: testSchema,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.schema).toBeDefined();
      expect(body.schema.type).toBe("object");
      expect(body.schema.properties).toHaveProperty("name");
      expect(body.schema.properties).toHaveProperty("age");
      expect(body.schema.properties).toHaveProperty("active");
      expect(body.schema.required).toContain("name");
      expect(body.schema.required).toContain("age");
    });

    it("should return validated object on success", async () => {
      const mockResponse = createMockResponse({
        object: { name: "Alice", age: 25, active: true },
        rawText: '{"name": "Alice", "age": 25, "active": true}',
        usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
        sessionId: "obj-session",
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await claudeCodeGenerateObject(testConfig, {
        prompt: "Generate person",
        schema: testSchema,
      });

      expect(result.object).toEqual({ name: "Alice", age: 25, active: true });
      expect(result.rawText).toBe(
        '{"name": "Alice", "age": 25, "active": true}',
      );
      expect(result.usage.totalTokens).toBe(70);
      expect(result.sessionId).toBe("obj-session");
    });

    it("should throw VALIDATION_ERROR when response fails Zod validation", async () => {
      const mockResponse = createMockResponse({
        object: { name: "Bob", age: "not-a-number" }, // age should be number
        rawText: '{"name": "Bob", "age": "not-a-number"}',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        sessionId: "session",
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await expect(
        claudeCodeGenerateObject(testConfig, {
          prompt: "test",
          schema: testSchema,
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
    });

    it("should include rawText in validation error for debugging", async () => {
      const mockResponse = createMockResponse({
        object: { invalid: "data" },
        rawText: '{"invalid": "data"}',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        sessionId: "session",
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      try {
        await claudeCodeGenerateObject(testConfig, {
          prompt: "test",
          schema: testSchema,
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ClaudeCodeError);
        expect((error as ClaudeCodeError).rawText).toBe('{"invalid": "data"}');
      }
    });

    it("should throw ClaudeCodeError on HTTP error", async () => {
      const errorResponse = createMockResponse(
        { error: "Schema parse error", code: "SCHEMA_ERROR", rawText: "..." },
        { status: 422, statusText: "Unprocessable Entity", ok: false },
      );

      global.fetch = vi.fn().mockResolvedValue(errorResponse);

      await expect(
        claudeCodeGenerateObject(testConfig, {
          prompt: "test",
          schema: testSchema,
        }),
      ).rejects.toMatchObject({
        message: "Schema parse error",
        code: "SCHEMA_ERROR",
      });
    });

    it("should handle complex nested schemas", async () => {
      const complexSchema = z.object({
        user: z.object({
          name: z.string(),
          emails: z.array(z.string().email()),
        }),
        settings: z.object({
          notifications: z.boolean(),
          theme: z.enum(["light", "dark"]),
        }),
      });

      const responseData = {
        user: { name: "Test", emails: ["test@example.com"] },
        settings: { notifications: true, theme: "dark" },
      };

      const mockResponse = createMockResponse({
        object: responseData,
        rawText: JSON.stringify(responseData),
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        sessionId: "complex-session",
      });

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await claudeCodeGenerateObject(testConfig, {
        prompt: "Generate complex object",
        schema: complexSchema,
      });

      expect(result.object).toEqual(responseData);
    });

    it("should send Authorization header", async () => {
      const mockResponse = createMockResponse({
        object: { name: "Test", age: 20 },
        rawText: "{}",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        sessionId: "s",
      });

      const mockFetch = vi.fn().mockResolvedValue(mockResponse);
      global.fetch = mockFetch;

      await claudeCodeGenerateObject(testConfig, {
        prompt: "test",
        schema: testSchema,
      });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe("Bearer test-auth-key-12345");
    });

    it("should call correct endpoint", async () => {
      const mockResponse = createMockResponse({
        object: { name: "Test", age: 20 },
        rawText: "{}",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        sessionId: "s",
      });

      const mockFetch = vi.fn().mockResolvedValue(mockResponse);
      global.fetch = mockFetch;

      await claudeCodeGenerateObject(testConfig, {
        prompt: "test",
        schema: testSchema,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe("http://localhost:3100/generate-object");
    });

    it("should throw INVALID_RESPONSE when response is not valid JSON", async () => {
      const invalidResponse = createMockResponse("not json");
      global.fetch = vi.fn().mockResolvedValue(invalidResponse);

      await expect(
        claudeCodeGenerateObject(testConfig, {
          prompt: "test",
          schema: testSchema,
        }),
      ).rejects.toMatchObject({
        message: "Invalid response from Claude Code wrapper: expected JSON",
        code: "INVALID_RESPONSE",
      });
    });
  });
});
