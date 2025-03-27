import { describe, it, expect, vi, beforeEach } from "vitest";
import { getModel } from "./model";
import { Provider, Model } from "./config";
import { env } from "@/env";
import type { UserAIFields } from "./types";

// Mock AI provider imports
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

vi.mock("ollama-ai-provider", () => ({
  createOllama: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@/env", () => ({
  env: {
    DEFAULT_LLM_PROVIDER: "openai",
    OPENAI_API_KEY: "test-openai-key",
    GOOGLE_API_KEY: "test-google-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    GROQ_API_KEY: "test-groq-key",
    OPENROUTER_API_KEY: "test-openrouter-key",
    OLLAMA_BASE_URL: "http://localhost:11434",
    NEXT_PUBLIC_OLLAMA_MODEL: "llama3",
    BEDROCK_REGION: "us-west-2",
    BEDROCK_ACCESS_KEY: "",
    BEDROCK_SECRET_KEY: "",
    NEXT_PUBLIC_BEDROCK_SONNET_MODEL: "anthropic.claude-3-sonnet-20240229-v1:0",
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("./config", async () => {
  const actual = await vi.importActual("./config");
  return {
    ...actual,
    supportsOllama: true,
  };
});

describe("Models", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(env).DEFAULT_LLM_PROVIDER = "openai";
  });

  describe("getModel", () => {
    it("should use default provider and model when user has no API key", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.model).toBe("gpt-4o");
    });

    it("should use user's provider and model when API key is provided", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: Model.GEMINI_1_5_PRO,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GOOGLE);
      expect(result.model).toBe(Model.GEMINI_1_5_PRO);
    });

    it("should use user's API key with default provider when only API key is provided", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.model).toBe("gpt-4o");
    });

    it("should configure OpenAI model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.OPEN_AI,
        aiModel: Model.GPT_4O,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.model).toBe(Model.GPT_4O);
      expect(result.llmModel).toBeDefined();
    });

    it("should configure Google model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: Model.GEMINI_1_5_PRO,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GOOGLE);
      expect(result.model).toBe(Model.GEMINI_1_5_PRO);
      expect(result.llmModel).toBeDefined();
    });

    it("should configure Groq model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.GROQ,
        aiModel: Model.GROQ_LLAMA_3_3_70B,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GROQ);
      expect(result.model).toBe(Model.GROQ_LLAMA_3_3_70B);
      expect(result.llmModel).toBeDefined();
    });

    it("should configure OpenRouter model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.OPENROUTER,
        aiModel: Model.GROQ_LLAMA_3_3_70B,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.model).toBe(Model.GROQ_LLAMA_3_3_70B);
      expect(result.llmModel).toBeDefined();
    });

    it("should configure Ollama model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.OLLAMA!,
        aiModel: "llama3",
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OLLAMA);
      expect(result.model).toBe("llama3");
      expect(result.llmModel).toBeDefined();
    });

    it("should configure Anthropic model correctly without Bedrock credentials", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.ANTHROPIC,
        aiModel: Model.CLAUDE_3_7_SONNET_ANTHROPIC,
      };

      vi.mocked(env).BEDROCK_ACCESS_KEY = "";
      vi.mocked(env).BEDROCK_SECRET_KEY = "";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.ANTHROPIC);
      expect(result.model).toBe(Model.CLAUDE_3_7_SONNET_ANTHROPIC);
      expect(result.llmModel).toBeDefined();
    });

    it("should configure Anthropic model with Bedrock when Bedrock credentials exist", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.ANTHROPIC,
        aiModel: Model.CLAUDE_3_7_SONNET_BEDROCK,
      };

      vi.mocked(env).BEDROCK_ACCESS_KEY = "test-bedrock-key";
      vi.mocked(env).BEDROCK_SECRET_KEY = "test-bedrock-secret";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.ANTHROPIC);
      expect(result.model).toBe(Model.CLAUDE_3_7_SONNET_BEDROCK);
      expect(result.llmModel).toBeDefined();
    });

    it("should throw error for unsupported provider", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: "unsupported" as any,
        aiModel: "some-model",
      };

      expect(() => getModel(userAi)).toThrow("LLM provider not supported");
    });
  });
});
