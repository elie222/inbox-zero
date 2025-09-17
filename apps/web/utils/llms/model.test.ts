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
    DEFAULT_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    ECONOMY_LLM_PROVIDER: "openrouter",
    ECONOMY_LLM_MODEL: "google/gemini-2.5-flash-preview-05-20",
    ECONOMY_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    CHAT_LLM_PROVIDER: "openrouter",
    CHAT_LLM_MODEL: "moonshotai/kimi-k2",
    CHAT_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
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
      expect(result.modelName).toBe("gpt-4o");
    });

    it("should use user's provider and model when API key is provided", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: Model.GEMINI_1_5_PRO,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GOOGLE);
      expect(result.modelName).toBe(Model.GEMINI_1_5_PRO);
    });

    it("should use user's API key with default provider when only API key is provided", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-4o");
    });

    it("should configure Google model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: Model.GEMINI_1_5_PRO,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GOOGLE);
      expect(result.modelName).toBe(Model.GEMINI_1_5_PRO);
      expect(result.model).toBeDefined();
    });

    it("should configure Groq model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.GROQ,
        aiModel: Model.GROQ_LLAMA_3_3_70B,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GROQ);
      expect(result.modelName).toBe(Model.GROQ_LLAMA_3_3_70B);
      expect(result.model).toBeDefined();
    });

    it("should configure OpenRouter model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.OPENROUTER,
        aiModel: Model.GROQ_LLAMA_3_3_70B,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe(Model.GROQ_LLAMA_3_3_70B);
      expect(result.model).toBeDefined();
    });

    // it("should configure Ollama model correctly", () => {
    //   const userAi: UserAIFields = {
    //     aiApiKey: "user-api-key",
    //     aiProvider: Provider.OLLAMA!,
    //     aiModel: "llama3",
    //   };

    //   const result = getModel(userAi);
    //   expect(result.provider).toBe(Provider.OLLAMA);
    //   expect(result.modelName).toBe("llama3");
    //   expect(result.model).toBeDefined();
    // });

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
      expect(result.modelName).toBe(Model.CLAUDE_3_7_SONNET_ANTHROPIC);
      expect(result.model).toBeDefined();
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
      expect(result.modelName).toBe(Model.CLAUDE_3_7_SONNET_BEDROCK);
      expect(result.model).toBeDefined();
    });

    it("should throw error for unsupported provider", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: "unsupported" as any,
        aiModel: "some-model",
      };

      expect(() => getModel(userAi)).toThrow("LLM provider not supported");
    });

    // it("should use chat model when modelType is 'chat'", () => {
    //   const userAi: UserAIFields = {
    //     aiApiKey: null,
    //     aiProvider: null,
    //     aiModel: null,
    //   };

    //   vi.mocked(env).CHAT_LLM_PROVIDER = "openrouter";
    //   vi.mocked(env).CHAT_LLM_MODEL = "moonshotai/kimi-k2";
    //   vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

    //   const result = getModel(userAi, "chat");
    //   expect(result.provider).toBe(Provider.OPENROUTER);
    //   expect(result.modelName).toBe("moonshotai/kimi-k2");
    // });

    // it("should use OpenRouter with provider options for chat", () => {
    //   const userAi: UserAIFields = {
    //     aiApiKey: null,
    //     aiProvider: null,
    //     aiModel: null,
    //   };

    //   vi.mocked(env).CHAT_LLM_PROVIDER = "openrouter";
    //   vi.mocked(env).CHAT_LLM_MODEL = "moonshotai/kimi-k2";
    //   vi.mocked(env).CHAT_OPENROUTER_PROVIDERS = "Google Vertex,Anthropic";
    //   vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

    //   const result = getModel(userAi, "chat");
    //   expect(result.provider).toBe(Provider.OPENROUTER);
    //   expect(result.modelName).toBe("moonshotai/kimi-k2");
    //   expect(result.providerOptions?.openrouter?.provider?.order).toEqual([
    //     "Google Vertex",
    //     "Anthropic",
    //   ]);
    // });

    it("should use economy model when modelType is 'economy'", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).ECONOMY_LLM_PROVIDER = "openrouter";
      vi.mocked(env).ECONOMY_LLM_MODEL =
        "google/gemini-2.5-flash-preview-05-20";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

      const result = getModel(userAi, "economy");
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("google/gemini-2.5-flash-preview-05-20");
    });

    it("should use OpenRouter with provider options for economy", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).ECONOMY_LLM_PROVIDER = "openrouter";
      vi.mocked(env).ECONOMY_LLM_MODEL =
        "google/gemini-2.5-flash-preview-05-20";
      vi.mocked(env).ECONOMY_OPENROUTER_PROVIDERS = "Google Vertex,Anthropic";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

      const result = getModel(userAi, "economy");
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("google/gemini-2.5-flash-preview-05-20");
      expect(result.providerOptions?.openrouter?.provider?.order).toEqual([
        "Google Vertex",
        "Anthropic",
      ]);
    });

    it("should use default model when modelType is 'default'", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      const result = getModel(userAi, "default");
      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-4o");
    });

    it("should use OpenRouter with provider options for default model", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_PROVIDER = "openrouter";
      vi.mocked(env).DEFAULT_LLM_MODEL = "anthropic/claude-3.5-sonnet";
      vi.mocked(env).DEFAULT_OPENROUTER_PROVIDERS = "Google Vertex,Anthropic";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

      const result = getModel(userAi, "default");
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("anthropic/claude-3.5-sonnet");
      expect(result.providerOptions?.openrouter?.provider?.order).toEqual([
        "Google Vertex",
        "Anthropic",
      ]);
    });
  });
});
