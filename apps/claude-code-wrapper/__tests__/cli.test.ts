/**
 * Tests for CLI execution module (cli.ts).
 *
 * Tests the core Claude CLI subprocess execution, argument building,
 * and output parsing functionality.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawn } from "node:child_process";
import {
  createMockChildProcess,
  simulateCliSuccess,
  simulateCliError,
  simulateSpawnError,
  createCliResultJson,
} from "./helpers.js";
import {
  executeClaudeCli,
  buildClaudeEnv,
  ClaudeCliError,
} from "../src/cli.js";

// Mock node:child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

describe("CLI Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildClaudeEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment for each test
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it("returns process.env when no OAuth token is set", () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = undefined;
      process.env.ANTHROPIC_API_KEY = "test-api-key";

      const env = buildClaudeEnv();

      expect(env.ANTHROPIC_API_KEY).toBe("test-api-key");
    });

    it("clears ANTHROPIC_API_KEY when OAuth token is present", () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token";
      process.env.ANTHROPIC_API_KEY = "test-api-key";

      const env = buildClaudeEnv();

      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oauth-token");
    });
  });

  describe("executeClaudeCli", () => {
    it("executes CLI with basic prompt and returns result", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const resultPromise = executeClaudeCli({ prompt: "Hello" });

      // Simulate successful CLI output
      simulateCliSuccess(
        mockProc,
        createCliResultJson({ result: "Hi there!" }),
      );

      const result = await resultPromise;

      expect(result.text).toBe("Hi there!");
      expect(result.usage).toEqual({
        inputTokens: 10,
        outputTokens: 15,
        totalTokens: 25,
      });
      expect(result.sessionId).toBe("test-session-123");
    });

    it("builds correct CLI arguments for basic prompt", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      executeClaudeCli({ prompt: "Test prompt" });

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        ["--print", "--output-format", "json", "Test prompt"],
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
      );
    });

    it("includes --system-prompt when system option is provided", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      executeClaudeCli({ prompt: "Test", system: "You are helpful" });

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--system-prompt", "You are helpful"]),
        expect.any(Object),
      );
    });

    it("includes --resume when sessionId is provided", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      executeClaudeCli({ prompt: "Test", sessionId: "session-abc" });

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--resume", "session-abc"]),
        expect.any(Object),
      );
    });

    it("includes --model when model option is provided", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      executeClaudeCli({ prompt: "Test", model: "sonnet" });

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--model", "sonnet"]),
        expect.any(Object),
      );
    });

    it("throws ClaudeCliError on non-zero exit code", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const resultPromise = executeClaudeCli({ prompt: "Test" });

      simulateCliError(mockProc, "Something went wrong", 1);

      await expect(resultPromise).rejects.toThrow(ClaudeCliError);
      await expect(resultPromise).rejects.toMatchObject({
        code: "CLI_EXIT_ERROR",
        message: expect.stringContaining("exited with code 1"),
      });
    });

    it("throws ClaudeCliError on spawn error", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const resultPromise = executeClaudeCli({ prompt: "Test" });

      simulateSpawnError(mockProc, new Error("ENOENT: command not found"));

      await expect(resultPromise).rejects.toThrow(ClaudeCliError);
      await expect(resultPromise).rejects.toMatchObject({
        code: "SPAWN_ERROR",
        message: expect.stringContaining("Failed to spawn"),
      });
    });

    it("times out and kills process when execution exceeds timeout", async () => {
      vi.useFakeTimers();
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const resultPromise = executeClaudeCli({
        prompt: "Test",
        timeoutMs: 1000,
      });

      // Advance time past the timeout
      vi.advanceTimersByTime(1001);

      await expect(resultPromise).rejects.toThrow(ClaudeCliError);
      await expect(resultPromise).rejects.toMatchObject({
        code: "TIMEOUT_ERROR",
        message: expect.stringContaining("timed out"),
      });

      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");

      vi.useRealTimers();
    });

    it("parses multi-line output and finds result object", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const resultPromise = executeClaudeCli({ prompt: "Test" });

      // Simulate output with multiple JSON lines (like streaming mode might produce)
      const multiLineOutput = [
        '{"type":"assistant","message":"thinking..."}',
        createCliResultJson({ result: "Final answer" }),
      ].join("\n");

      simulateCliSuccess(mockProc, multiLineOutput);

      const result = await resultPromise;
      expect(result.text).toBe("Final answer");
    });

    it("throws when no result object found in output", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const resultPromise = executeClaudeCli({ prompt: "Test" });

      // Simulate output with no result type
      simulateCliSuccess(
        mockProc,
        '{"type":"assistant","message":"thinking..."}',
      );

      await expect(resultPromise).rejects.toThrow(ClaudeCliError);
      await expect(resultPromise).rejects.toMatchObject({
        code: "PARSE_ERROR",
        message: expect.stringContaining("No valid result found"),
      });
    });

    it("closes stdin after spawn", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      executeClaudeCli({ prompt: "Test" });

      expect(mockProc.stdin.end).toHaveBeenCalled();
    });

    it("generates session ID when not provided in result", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const resultPromise = executeClaudeCli({ prompt: "Test" });

      // Result without session_id
      simulateCliSuccess(
        mockProc,
        JSON.stringify({
          type: "result",
          result: "Hello",
          total_tokens_in: 5,
          total_tokens_out: 5,
        }),
      );

      const result = await resultPromise;

      // Should generate a UUID
      expect(result.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("ClaudeCliError", () => {
    it("preserves error code and raw output", () => {
      const error = new ClaudeCliError("Test error", "TEST_CODE", "raw output");

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.rawOutput).toBe("raw output");
      expect(error.name).toBe("ClaudeCliError");
    });
  });
});
