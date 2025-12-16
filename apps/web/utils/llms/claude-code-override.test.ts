/**
 * Tests for Claude Code override branching logic in createGenerateText/createGenerateObject.
 *
 * These tests verify that when DEFAULT_LLM_PROVIDER=claudecode, the override logic
 * correctly routes to Claude Code regardless of what model type was passed.
 *
 * This is critical for upstream merge protection - ensures our override logic
 * isn't accidentally reverted by upstream commits.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { Provider } from "./config";
import { env } from "@/env";
import type { UserAIFields } from "./types";

// Mock dependencies
vi.mock("@/env", () => ({
  env: {
    DEFAULT_LLM_PROVIDER: "claudecode",
    ECONOMY_LLM_PROVIDER: undefined as string | undefined,
    ECONOMY_LLM_MODEL: undefined as string | undefined,
    CHAT_LLM_PROVIDER: "anthropic",
    CHAT_LLM_MODEL: "claude-3-5-haiku-20241022",
    CLAUDE_CODE_BASE_URL: "http://localhost:3100",
    CLAUDE_CODE_TIMEOUT: 120_000,
    CLAUDE_CODE_WRAPPER_API_KEY: "test-auth-key",
    CLAUDE_CODE_MODEL: "sonnet",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    OPENAI_API_KEY: "test-openai-key",
    GOOGLE_API_KEY: "test-google-key",
    GROQ_API_KEY: "test-groq-key",
    OPENROUTER_API_KEY: "test-openrouter-key",
    BEDROCK_REGION: "us-west-2",
    BEDROCK_ACCESS_KEY: "",
    BEDROCK_SECRET_KEY: "",
  },
}));

// Mock AI providers
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => (model: string) => ({ model, provider: "openai" })),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => (model: string) => ({
    model,
    provider: "anthropic",
  })),
}));

vi.mock("@ai-sdk/amazon-bedrock", () => ({
  createAmazonBedrock: vi.fn(() => (model: string) => ({
    model,
    provider: "bedrock",
  })),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => (model: string) => ({
    model,
    provider: "google",
  })),
}));

vi.mock("@ai-sdk/groq", () => ({
  createGroq: vi.fn(() => (model: string) => ({ model, provider: "groq" })),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => ({
    chat: vi.fn((model: string) => ({ model, provider: "openrouter" })),
  })),
}));

vi.mock("@ai-sdk/gateway", () => ({
  createGateway: vi.fn(() => (model: string) => ({
    model,
    provider: "ai-gateway",
  })),
}));

vi.mock("ollama-ai-provider-v2", () => ({
  createOllama: vi.fn(() => (model: string) => ({ model, provider: "ollama" })),
}));

vi.mock("server-only", () => ({}));

// Mock the Claude Code LLM module to track when it's called
const mockClaudeCodeGenerateText = vi.fn();
const mockClaudeCodeGenerateObject = vi.fn();

vi.mock("@/utils/llms/claude-code-llm", () => ({
  createClaudeCodeGenerateText: (config: unknown) => {
    mockClaudeCodeGenerateText(config);
    return vi.fn().mockResolvedValue({ text: "mock response" });
  },
  createClaudeCodeGenerateObject: (config: unknown) => {
    mockClaudeCodeGenerateObject(config);
    return vi.fn().mockResolvedValue({ object: { mock: true } });
  },
}));

// Mock usage tracking
vi.mock("@/utils/usage", () => ({
  saveAiUsage: vi.fn().mockResolvedValue(undefined),
}));

// Mock error messages
vi.mock("@/utils/error-messages", () => ({
  addUserErrorMessage: vi.fn(),
  ErrorType: {},
}));

describe("Claude Code Override Branching Logic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset to default test configuration
    vi.mocked(env).DEFAULT_LLM_PROVIDER = "claudecode";
    vi.mocked(env).CHAT_LLM_PROVIDER = "anthropic";
    vi.mocked(env).CHAT_LLM_MODEL = "claude-3-5-haiku-20241022";
    vi.mocked(env).CLAUDE_CODE_BASE_URL = "http://localhost:3100";
    vi.mocked(env).CLAUDE_CODE_WRAPPER_API_KEY = "test-auth-key";
    vi.mocked(env).CLAUDE_CODE_MODEL = "sonnet";
  });

  describe("createGenerateText override behavior", () => {
    it("should use Claude Code when DEFAULT_LLM_PROVIDER=claudecode even if model type routes to anthropic", async () => {
      // This is the key test case: when chat model type is used, it normally
      // routes to Anthropic (CHAT_LLM_PROVIDER), but our override should
      // redirect it to Claude Code because DEFAULT_LLM_PROVIDER=claudecode
      const { createGenerateText } = await import("./index");
      const { getModel } = await import("./model");

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      // Get "chat" model - this would normally route to Anthropic
      const modelOptions = getModel(userAi, "chat");

      // Verify the model type selected Anthropic (proving our test setup is correct)
      expect(modelOptions.provider).toBe(Provider.ANTHROPIC);

      // Create the generateText function - override should kick in
      const generateText = createGenerateText({
        emailAccount: { email: "test@example.com", id: "test-id" },
        label: "test",
        modelOptions,
      });

      // Verify Claude Code was used instead of Anthropic
      expect(mockClaudeCodeGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: Provider.CLAUDE_CODE,
          config: expect.objectContaining({
            baseUrl: "http://localhost:3100",
            authKey: "test-auth-key",
          }),
        }),
      );
    });

    it("should NOT override when DEFAULT_LLM_PROVIDER is not claudecode", async () => {
      // Change default to anthropic
      vi.mocked(env).DEFAULT_LLM_PROVIDER = "anthropic";

      // Re-import to get fresh module with new env
      vi.resetModules();
      const { createGenerateText } = await import("./index");
      const { getModel } = await import("./model");

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const modelOptions = getModel(userAi, "default");

      // Create the generateText function
      createGenerateText({
        emailAccount: { email: "test@example.com", id: "test-id" },
        label: "test",
        modelOptions,
      });

      // Claude Code should NOT be called
      expect(mockClaudeCodeGenerateText).not.toHaveBeenCalled();
    });

    it("should use Claude Code when provider is explicitly CLAUDE_CODE", async () => {
      // When provider is explicitly Claude Code (not via override)
      vi.mocked(env).DEFAULT_LLM_PROVIDER = "anthropic"; // Not claudecode

      vi.resetModules();
      const { createGenerateText } = await import("./index");
      const { getModel } = await import("./model");

      // Directly configure Claude Code as default
      vi.mocked(env).DEFAULT_LLM_PROVIDER = "claudecode";

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const modelOptions = getModel(userAi, "default");

      // Now provider should be Claude Code directly
      expect(modelOptions.provider).toBe(Provider.CLAUDE_CODE);

      createGenerateText({
        emailAccount: { email: "test@example.com", id: "test-id" },
        label: "test",
        modelOptions,
      });

      // Claude Code should be called with the config from modelOptions
      expect(mockClaudeCodeGenerateText).toHaveBeenCalled();
    });

    it("should NOT override when Claude Code env vars are missing", async () => {
      vi.mocked(env).DEFAULT_LLM_PROVIDER = "claudecode";
      vi.mocked(env).CLAUDE_CODE_BASE_URL = ""; // Missing!
      vi.mocked(env).CLAUDE_CODE_WRAPPER_API_KEY = ""; // Missing!
      vi.mocked(env).CHAT_LLM_PROVIDER = "anthropic";

      vi.resetModules();
      const { createGenerateText } = await import("./index");
      const { getModel } = await import("./model");

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      // getModel with "chat" type - routes to Anthropic
      const modelOptions = getModel(userAi, "chat");
      expect(modelOptions.provider).toBe(Provider.ANTHROPIC);

      // Override should NOT happen because Claude Code env vars are missing
      createGenerateText({
        emailAccount: { email: "test@example.com", id: "test-id" },
        label: "test",
        modelOptions,
      });

      // Claude Code should NOT be called
      expect(mockClaudeCodeGenerateText).not.toHaveBeenCalled();
    });
  });

  describe("createGenerateObject override behavior", () => {
    it("should use Claude Code when DEFAULT_LLM_PROVIDER=claudecode even if model type routes to anthropic", async () => {
      const { createGenerateObject } = await import("./index");
      const { getModel } = await import("./model");

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      // Get "chat" model - normally routes to Anthropic
      const modelOptions = getModel(userAi, "chat");
      expect(modelOptions.provider).toBe(Provider.ANTHROPIC);

      // Create the generateObject function - override should kick in
      const generateObject = createGenerateObject({
        emailAccount: { email: "test@example.com", id: "test-id" },
        label: "test",
        modelOptions,
      });

      // Verify Claude Code was used
      expect(mockClaudeCodeGenerateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: Provider.CLAUDE_CODE,
          config: expect.objectContaining({
            baseUrl: "http://localhost:3100",
          }),
        }),
      );
    });

    it("should NOT override when DEFAULT_LLM_PROVIDER is not claudecode", async () => {
      vi.mocked(env).DEFAULT_LLM_PROVIDER = "anthropic";

      vi.resetModules();
      const { createGenerateObject } = await import("./index");
      const { getModel } = await import("./model");

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const modelOptions = getModel(userAi, "default");

      createGenerateObject({
        emailAccount: { email: "test@example.com", id: "test-id" },
        label: "test",
        modelOptions,
      });

      expect(mockClaudeCodeGenerateObject).not.toHaveBeenCalled();
    });
  });

  describe("buildClaudeCodeConfig helper", () => {
    it("should build config with default model when no override provided", async () => {
      vi.mocked(env).CLAUDE_CODE_MODEL = "sonnet";

      vi.resetModules();
      const { buildClaudeCodeConfig } = await import("./model");

      const config = buildClaudeCodeConfig();

      expect(config).toEqual({
        baseUrl: "http://localhost:3100",
        timeout: 120_000,
        authKey: "test-auth-key",
        model: "sonnet",
      });
    });

    it("should use model override when provided", async () => {
      vi.resetModules();
      const { buildClaudeCodeConfig } = await import("./model");

      const config = buildClaudeCodeConfig("haiku");

      expect(config.model).toBe("haiku");
    });

    it("should throw when CLAUDE_CODE_BASE_URL is missing", async () => {
      vi.mocked(env).CLAUDE_CODE_BASE_URL = "";

      vi.resetModules();
      const { buildClaudeCodeConfig } = await import("./model");

      expect(() => buildClaudeCodeConfig()).toThrow(
        "CLAUDE_CODE_BASE_URL is required",
      );
    });

    it("should throw when CLAUDE_CODE_WRAPPER_API_KEY is missing", async () => {
      vi.mocked(env).CLAUDE_CODE_BASE_URL = "http://localhost:3100";
      vi.mocked(env).CLAUDE_CODE_WRAPPER_API_KEY = "";

      vi.resetModules();
      const { buildClaudeCodeConfig } = await import("./model");

      expect(() => buildClaudeCodeConfig()).toThrow(
        "CLAUDE_CODE_WRAPPER_API_KEY is required",
      );
    });
  });

  describe("isClaudeCodeAvailable helper", () => {
    it("should return true when all required env vars are set", async () => {
      vi.mocked(env).CLAUDE_CODE_BASE_URL = "http://localhost:3100";
      vi.mocked(env).CLAUDE_CODE_WRAPPER_API_KEY = "test-key";

      vi.resetModules();
      const { isClaudeCodeAvailable } = await import("./model");

      expect(isClaudeCodeAvailable()).toBe(true);
    });

    it("should return false when CLAUDE_CODE_BASE_URL is missing", async () => {
      vi.mocked(env).CLAUDE_CODE_BASE_URL = "";
      vi.mocked(env).CLAUDE_CODE_WRAPPER_API_KEY = "test-key";

      vi.resetModules();
      const { isClaudeCodeAvailable } = await import("./model");

      expect(isClaudeCodeAvailable()).toBe(false);
    });

    it("should return false when CLAUDE_CODE_WRAPPER_API_KEY is missing", async () => {
      vi.mocked(env).CLAUDE_CODE_BASE_URL = "http://localhost:3100";
      vi.mocked(env).CLAUDE_CODE_WRAPPER_API_KEY = "";

      vi.resetModules();
      const { isClaudeCodeAvailable } = await import("./model");

      expect(isClaudeCodeAvailable()).toBe(false);
    });
  });
});
