import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOpenAI } from "@ai-sdk/openai";
import { getModel } from "./model";
import { Provider } from "./config";
import { env } from "@/env";
import type { UserAIFields } from "./types";
import { createOllama } from "ollama-ai-provider-v2";

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

vi.mock("ollama-ai-provider-v2", () => ({
  createOllama: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => (model: string) => ({ model })),
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
    OPENROUTER_BACKUP_MODEL: "google/gemini-2.5-flash",
    OLLAMA_BASE_URL: "http://localhost:11434",
    LM_STUDIO_BASE_URL: "http://localhost:1234",
    NEXT_PUBLIC_OLLAMA_MODEL: "llama3",
    BEDROCK_REGION: "us-west-2",
    BEDROCK_ACCESS_KEY: "",
    BEDROCK_SECRET_KEY: "",
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("./config", async () => {
  const actual = await vi.importActual("./config");
  return {
    ...actual,
    allowUserAiProviderUrl: true,
    supportsOllama: true,
    supportsLmStudio: true,
  };
});

describe("Models", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(env).DEFAULT_LLM_PROVIDER = "openai";
    vi.mocked(env).DEFAULT_LLM_MODEL = undefined;
    vi.mocked(env).BEDROCK_ACCESS_KEY = "";
    vi.mocked(env).BEDROCK_SECRET_KEY = "";
    vi.mocked(env).NEXT_PUBLIC_OLLAMA_MODEL = "llama3";
    vi.mocked(env).OLLAMA_BASE_URL = "http://localhost:11434";
    vi.mocked(env).LM_STUDIO_BASE_URL = "http://localhost:1234";
  });

  describe("getModel", () => {
    it("should use default provider and model when user has no API key", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
        aiBaseUrl: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.1");
    });

    it("should use user's provider and model when API key is provided", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: "gemini-1.5-pro-latest",
        aiBaseUrl: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GOOGLE);
      expect(result.modelName).toBe("gemini-1.5-pro-latest");
    });

    it("should use user's API key with default provider when only API key is provided", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: null,
        aiModel: null,
        aiBaseUrl: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.1");
    });

    it("should configure Google model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: "gemini-1.5-pro-latest",
        aiBaseUrl: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GOOGLE);
      expect(result.modelName).toBe("gemini-1.5-pro-latest");
      expect(result.model).toBeDefined();
    });

    it("should configure Groq model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.GROQ,
        aiModel: "llama-3.3-70b-versatile",
        aiBaseUrl: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GROQ);
      expect(result.modelName).toBe("llama-3.3-70b-versatile");
      expect(result.model).toBeDefined();
    });

    it("normalizes OpenAI base URLs to include /v1 for responses endpoint", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.OPEN_AI,
        aiModel: "gpt-4o-mini",
        aiBaseUrl: "http://localhost:1234/",
      };

      getModel(userAi);

      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: "user-api-key",
        baseURL: "http://localhost:1234/v1",
      });
    });

    it("should configure OpenRouter model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.OPENROUTER,
        aiModel: "llama-3.3-70b-versatile",
        aiBaseUrl: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("llama-3.3-70b-versatile");
      expect(result.model).toBeDefined();
    });

    it("should configure Ollama model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: Provider.OLLAMA!,
        aiModel: "llama3",
        aiBaseUrl: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OLLAMA);
      expect(result.modelName).toBe("llama3");
      expect(result.model).toBeDefined();
      expect(createOllama).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/api",
      });
      expect(result.backupModel).toBeNull();
    });

    it("should throw when Ollama model is missing", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: Provider.OLLAMA!,
        aiModel: null,
        aiBaseUrl: null,
      };

      expect(() => getModel(userAi)).toThrow("Ollama model must be specified");
    });

    it("should fall back to default Ollama base URL when env missing", () => {
      vi.mocked(env).OLLAMA_BASE_URL = undefined as any;

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: Provider.OLLAMA!,
        aiModel: "llama3",
        aiBaseUrl: null,
      };

      getModel(userAi);

      expect(createOllama).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/api",
      });
    });

    it("should configure LM Studio model correctly with env base URL", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: Provider.LM_STUDIO,
        aiModel: "llama-3.2-1b",
        aiBaseUrl: null,
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.LM_STUDIO);
      expect(result.modelName).toBe("llama-3.2-1b");
      expect(result.model).toBeDefined();
      expect(result.baseURL).toBe("http://localhost:1234/v1");
      expect(result.backupModel).toBeNull();
    });

    it("should configure LM Studio with user-provided base URL when allowed", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: Provider.LM_STUDIO,
        aiModel: "mistral-7b",
        aiBaseUrl: "http://192.168.1.100:1234",
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.LM_STUDIO);
      expect(result.modelName).toBe("mistral-7b");
      expect(result.baseURL).toBe("http://192.168.1.100:1234/v1");
    });

    it("should throw when LM Studio model is missing", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: Provider.LM_STUDIO,
        aiModel: null,
        aiBaseUrl: null,
      };

      expect(() => getModel(userAi)).toThrow(
        "LM Studio model must be specified",
      );
    });

    it("should throw when LM Studio base URL is missing and env not set", () => {
      vi.mocked(env).LM_STUDIO_BASE_URL = undefined as any;

      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: Provider.LM_STUDIO,
        aiModel: "llama-3.2-1b",
        aiBaseUrl: null,
      };

      expect(() => getModel(userAi)).toThrow(
        "LM Studio requires a base URL. Set LM_STUDIO_BASE_URL or enable ALLOW_USER_AI_PROVIDER_URL.",
      );
    });

    it("should normalize LM Studio URL to include /v1", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: Provider.LM_STUDIO,
        aiModel: "llama-3.2-1b",
        aiBaseUrl: "http://localhost:1234/",
      };

      const result = getModel(userAi);
      expect(result.baseURL).toBe("http://localhost:1234/v1");
    });

    it("should configure Anthropic model correctly without Bedrock credentials", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.ANTHROPIC,
        aiModel: "claude-3-7-sonnet-20250219",
        aiBaseUrl: null,
      };

      vi.mocked(env).BEDROCK_ACCESS_KEY = "";
      vi.mocked(env).BEDROCK_SECRET_KEY = "";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.ANTHROPIC);
      expect(result.modelName).toBe("claude-3-7-sonnet-20250219");
      expect(result.model).toBeDefined();
    });

    it("should configure Bedrock model correctly via env vars", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
        aiBaseUrl: null,
      };

      vi.mocked(env).DEFAULT_LLM_PROVIDER = "bedrock";
      vi.mocked(env).DEFAULT_LLM_MODEL =
        "us.anthropic.claude-3-7-sonnet-20250219-v1:0";
      vi.mocked(env).BEDROCK_ACCESS_KEY = "test-bedrock-key";
      vi.mocked(env).BEDROCK_SECRET_KEY = "test-bedrock-secret";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.BEDROCK);
      expect(result.modelName).toBe(
        "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
      );
      expect(result.model).toBeDefined();
    });

    it("should throw error for unsupported provider", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: "unsupported" as any,
        aiModel: "some-model",
        aiBaseUrl: null,
      };

      expect(() => getModel(userAi)).toThrow("LLM provider not supported");
    });

    // it("should use chat model when modelType is 'chat'", () => {
    //   const userAi: UserAIFields = {
    //     aiApiKey: null,
    //     aiProvider: null,
    //     aiModel: null,
    //     aiBaseUrl: null,
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
    //     aiBaseUrl: null,
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
        aiBaseUrl: null,
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
        aiBaseUrl: null,
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
        aiBaseUrl: null,
      };

      // Reset to default
      vi.mocked(env).DEFAULT_LLM_PROVIDER = "openai";
      vi.mocked(env).DEFAULT_LLM_MODEL = undefined;

      const result = getModel(userAi, "default");
      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.1");
    });

    it("should use OpenRouter with provider options for default model", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
        aiBaseUrl: null,
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
