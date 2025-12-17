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
    ECONOMY_LLM_PROVIDER: undefined as string | undefined,
    ECONOMY_LLM_MODEL: undefined as string | undefined,
    CLAUDE_CODE_BASE_URL: "http://localhost:3100",
    CLAUDE_CODE_TIMEOUT: 120_000,
    CLAUDE_CODE_WRAPPER_API_KEY: "test-auth-key-12345",
    CLAUDE_CODE_MODEL: undefined as string | undefined,
    CLAUDE_CODE_ECONOMY_MODEL: undefined as string | undefined,
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
    vi.mocked(env).ECONOMY_LLM_PROVIDER = undefined;
    vi.mocked(env).ECONOMY_LLM_MODEL = undefined;
    vi.mocked(env).CLAUDE_CODE_BASE_URL = "http://localhost:3100";
    vi.mocked(env).CLAUDE_CODE_TIMEOUT = 120_000;
    vi.mocked(env).CLAUDE_CODE_WRAPPER_API_KEY = "test-auth-key-12345";
    vi.mocked(env).CLAUDE_CODE_MODEL = undefined;
    vi.mocked(env).CLAUDE_CODE_ECONOMY_MODEL = undefined;
  });

  describe("getModel with Claude Code", () => {
    it("should configure Claude Code provider with default model (sonnet)", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.CLAUDE_CODE);
      expect(result.modelName).toBe("sonnet");
      expect(result.claudeCodeConfig).toEqual({
        baseUrl: "http://localhost:3100",
        timeout: 120_000,
        authKey: "test-auth-key-12345",
        model: "sonnet",
      });
      expect(result.backupModel).toBeNull();
    });

    it("should allow overriding default model via CLAUDE_CODE_MODEL", () => {
      vi.mocked(env).CLAUDE_CODE_MODEL = "opus";

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi);
      expect(result.modelName).toBe("opus");
      expect(result.claudeCodeConfig?.model).toBe("opus");
    });

    it("should use economy model when ECONOMY_LLM_PROVIDER is claudecode", () => {
      vi.mocked(env).ECONOMY_LLM_PROVIDER = "claudecode";
      vi.mocked(env).CLAUDE_CODE_MODEL = "sonnet";
      vi.mocked(env).CLAUDE_CODE_ECONOMY_MODEL = "haiku";

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi, "economy");
      expect(result.modelName).toBe("haiku");
      expect(result.claudeCodeConfig?.model).toBe("haiku");
    });

    it("should default to haiku for economy when CLAUDE_CODE_ECONOMY_MODEL not set", () => {
      vi.mocked(env).ECONOMY_LLM_PROVIDER = "claudecode";
      // CLAUDE_CODE_ECONOMY_MODEL is undefined - should default to "haiku"

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi, "economy");
      expect(result.modelName).toBe("haiku");
      expect(result.claudeCodeConfig?.model).toBe("haiku");
    });

    it("should use different provider for economy when ECONOMY_LLM_PROVIDER differs from DEFAULT", () => {
      // Scenario: Claude Code for complex tasks, Anthropic API for bulk/economy tasks
      vi.mocked(env).DEFAULT_LLM_PROVIDER = "claudecode";
      vi.mocked(env).ECONOMY_LLM_PROVIDER = "anthropic";
      vi.mocked(env).ECONOMY_LLM_MODEL = "claude-3-5-haiku-20241022";
      vi.mocked(env).ANTHROPIC_API_KEY = "test-anthropic-key";
      vi.mocked(env).CLAUDE_CODE_MODEL = "sonnet";

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      // Default should use Claude Code
      const defaultResult = getModel(userAi, "default");
      expect(defaultResult.provider).toBe(Provider.CLAUDE_CODE);
      expect(defaultResult.modelName).toBe("sonnet");
      expect(defaultResult.claudeCodeConfig).toBeDefined();

      // Economy should use Anthropic (different provider)
      const economyResult = getModel(userAi, "economy");
      expect(economyResult.provider).toBe(Provider.ANTHROPIC);
      expect(economyResult.modelName).toBe("claude-3-5-haiku-20241022");
      expect(economyResult.claudeCodeConfig).toBeUndefined();
    });

    it("should fall back to default model when economy provider not configured", () => {
      // When no ECONOMY_LLM_PROVIDER is set, economy requests fall back to default
      vi.mocked(env).DEFAULT_LLM_PROVIDER = "claudecode";
      vi.mocked(env).ECONOMY_LLM_PROVIDER = undefined;
      vi.mocked(env).CLAUDE_CODE_MODEL = "sonnet";

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi, "economy");
      // Falls back to default (Claude Code) since no economy provider configured
      expect(result.provider).toBe(Provider.CLAUDE_CODE);
      expect(result.modelName).toBe("sonnet");
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

    it("should throw error when Claude Code provider is used without auth key", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).CLAUDE_CODE_WRAPPER_API_KEY = "";

      expect(() => getModel(userAi)).toThrow(
        "CLAUDE_CODE_WRAPPER_API_KEY is required for Claude Code provider",
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
