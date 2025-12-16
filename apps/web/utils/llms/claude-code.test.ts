/**
 * Tests for Claude Code provider integration.
 *
 * Kept separate from model.test.ts to minimize upstream merge conflicts.
 * These tests validate the Claude Code CLI wrapper integration, which is
 * a custom extension not present in the upstream Inbox Zero repository.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getModel } from "./model";
import { Provider } from "./config";
import { env } from "@/env";
import type { UserAIFields } from "./types";

// Mock AI provider imports (minimal set needed for Claude Code tests)
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@ai-sdk/amazon-bedrock", () => ({
  createAmazonBedrock: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@ai-sdk/groq", () => ({
  createGroq: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => ({
    chat: vi.fn((model: string) => ({ model })),
  })),
}));

vi.mock("@ai-sdk/gateway", () => ({
  createGateway: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("ollama-ai-provider-v2", () => ({
  createOllama: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@/env", () => ({
  env: {
    DEFAULT_LLM_PROVIDER: "claudecode",
    CLAUDE_CODE_BASE_URL: "http://localhost:3100",
    CLAUDE_CODE_TIMEOUT: 120_000,
    // Minimal other env vars needed by the module
    OPENAI_API_KEY: "test-key",
    ANTHROPIC_API_KEY: "test-key",
    GOOGLE_API_KEY: "test-key",
    GROQ_API_KEY: "test-key",
    OPENROUTER_API_KEY: "test-key",
    BEDROCK_REGION: "us-west-2",
    BEDROCK_ACCESS_KEY: "",
    BEDROCK_SECRET_KEY: "",
  },
}));

vi.mock("server-only", () => ({}));

describe("Claude Code Provider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(env).DEFAULT_LLM_PROVIDER = "claudecode";
    vi.mocked(env).CLAUDE_CODE_BASE_URL = "http://localhost:3100";
    vi.mocked(env).CLAUDE_CODE_TIMEOUT = 120_000;
  });

  describe("getModel with Claude Code", () => {
    it("should configure Claude Code provider correctly via env vars", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.CLAUDE_CODE);
      expect(result.modelName).toBe("claude-code-cli");
      expect(result.claudeCodeConfig).toEqual({
        baseUrl: "http://localhost:3100",
        timeout: 120_000,
      });
      expect(result.backupModel).toBeNull();
    });

    it("should throw error when Claude Code provider is used without base URL", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).CLAUDE_CODE_BASE_URL = "";

      expect(() => getModel(userAi)).toThrow(
        "CLAUDE_CODE_BASE_URL is required for Claude Code provider",
      );
    });

    it("should use custom timeout from environment", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).CLAUDE_CODE_TIMEOUT = 300_000;

      const result = getModel(userAi);
      expect(result.claudeCodeConfig?.timeout).toBe(300_000);
    });

    it("should not provide a backup model for Claude Code", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi);
      expect(result.backupModel).toBeNull();
    });

    it("should set model to null (uses HTTP client instead)", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi);
      // Claude Code doesn't use Vercel AI SDK's LanguageModelV2
      // The model field is set to null and claudeCodeConfig is used instead
      expect(result.model).toBeNull();
    });
  });
});
