/**
 * End-to-End tests with real Claude CLI.
 *
 * These tests call the actual Claude CLI and require:
 * - Claude CLI installed (`claude` command available)
 * - Valid authentication (OAuth token or API key)
 *
 * SKIPPED by default. Run with: RUN_E2E_TESTS=true pnpm test:e2e
 */

import { describe, it, expect } from "vitest";
import { executeClaudeCli } from "../../src/cli.js";

const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS === "true";

describe.skipIf(!RUN_E2E_TESTS)("Real Claude CLI (E2E)", () => {
  /**
   * Tests that require valid Claude CLI installation and authentication.
   * These tests make actual API calls and consume tokens.
   */

  it(
    "can execute a simple prompt with real CLI",
    async () => {
      // Use a simple prompt that should get a short response
      const result = await executeClaudeCli({
        prompt: 'Respond with only the word "test" and nothing else.',
        timeoutMs: 30_000,
      });

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.usage).toBeDefined();
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.sessionId).toBeDefined();
    },
    { timeout: 60_000 },
  );

  it(
    "can use system prompt with real CLI",
    async () => {
      const result = await executeClaudeCli({
        prompt: "What is your purpose?",
        system: "You are a calculator. Respond in one sentence.",
        timeoutMs: 30_000,
      });

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  it(
    "returns usage statistics from real CLI",
    async () => {
      const result = await executeClaudeCli({
        prompt: "Say hello",
        timeoutMs: 30_000,
      });

      expect(result.usage).toMatchObject({
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        totalTokens: expect.any(Number),
      });

      // Verify token counts are reasonable
      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBe(
        result.usage.inputTokens + result.usage.outputTokens,
      );
    },
    { timeout: 60_000 },
  );

  it(
    "returns session ID for conversation continuity",
    async () => {
      const result = await executeClaudeCli({
        prompt: "Remember the number 42.",
        timeoutMs: 30_000,
      });

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId.length).toBeGreaterThan(0);

      // Session ID should be a valid UUID format
      expect(result.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    },
    { timeout: 60_000 },
  );
});

describe.skipIf(!RUN_E2E_TESTS)("Real CLI Error Handling (E2E)", () => {
  it(
    "handles timeout gracefully",
    async () => {
      // Use extremely short timeout to force timeout
      await expect(
        executeClaudeCli({
          prompt: "Write a very long essay about the history of computing.",
          timeoutMs: 100, // Very short timeout
        }),
      ).rejects.toThrow(/timed out/i);
    },
    { timeout: 10_000 },
  );
});
