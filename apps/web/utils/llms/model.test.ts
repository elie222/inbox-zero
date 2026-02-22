import { describe, it, expect, vi, beforeEach } from "vitest";
import { getModel } from "./model";
import { Provider } from "./config";
import { env } from "@/env";
import type { UserAIFields } from "./types";
import { createAzure } from "@ai-sdk/azure";

// Mock AI provider imports
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@ai-sdk/azure", () => ({
  createAzure: vi.fn(() => (model: string) => ({ model })),
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
    DEFAULT_LLM_FALLBACKS: undefined,
    DEFAULT_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    ECONOMY_LLM_PROVIDER: "openrouter",
    ECONOMY_LLM_MODEL: "google/gemini-2.5-flash-preview-05-20",
    ECONOMY_LLM_FALLBACKS: undefined,
    ECONOMY_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    CHAT_LLM_PROVIDER: "openrouter",
    CHAT_LLM_MODEL: "moonshotai/kimi-k2",
    CHAT_LLM_FALLBACKS: undefined,
    CHAT_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    OPENROUTER_BACKUP_MODEL: undefined,
    USE_BACKUP_MODEL: false,
    OPENAI_API_KEY: "test-openai-key",
    AZURE_API_KEY: "test-azure-key",
    AZURE_RESOURCE_NAME: "test-azure-resource",
    AZURE_API_VERSION: "2024-10-21",
    GOOGLE_API_KEY: "test-google-key",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    GROQ_API_KEY: "test-groq-key",
    OPENROUTER_API_KEY: "test-openrouter-key",
    OLLAMA_BASE_URL: "http://localhost:11434/api",
    OLLAMA_MODEL: "llama3",
    OPENAI_COMPATIBLE_BASE_URL: "http://localhost:1234/v1",
    OPENAI_COMPATIBLE_MODEL: "llama-3.2-3b-instruct",
    OPENAI_COMPATIBLE_API_KEY: undefined,
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
    supportsOllama: true,
  };
});

describe("Models", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(env).DEFAULT_LLM_PROVIDER = "openai";
    vi.mocked(env).DEFAULT_LLM_MODEL = undefined;
    vi.mocked(env).DEFAULT_LLM_FALLBACKS = undefined;
    vi.mocked(env).ECONOMY_LLM_FALLBACKS = undefined;
    vi.mocked(env).CHAT_LLM_FALLBACKS = undefined;
    vi.mocked(env).OPENROUTER_BACKUP_MODEL = undefined;
    vi.mocked(env).USE_BACKUP_MODEL = false;
    vi.mocked(env).AZURE_API_KEY = "test-azure-key";
    vi.mocked(env).AZURE_RESOURCE_NAME = "test-azure-resource";
    vi.mocked(env).AZURE_API_VERSION = "2024-10-21";
    vi.mocked(env).BEDROCK_ACCESS_KEY = "";
    vi.mocked(env).BEDROCK_SECRET_KEY = "";
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
      expect(result.modelName).toBe("gpt-5.1");
    });

    it("should use user's provider and model when API key is provided", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: "gemini-1.5-pro-latest",
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
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GROQ);
      expect(result.modelName).toBe("llama-3.3-70b-versatile");
      expect(result.model).toBeDefined();
    });

    it("should configure OpenRouter model correctly", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.OPENROUTER,
        aiModel: "llama-3.3-70b-versatile",
      };

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("llama-3.3-70b-versatile");
      expect(result.model).toBeDefined();
    });

    it("should configure Ollama model correctly via env vars", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_PROVIDER = "ollama";
      vi.mocked(env).OLLAMA_MODEL = "llama3";
      vi.mocked(env).OLLAMA_BASE_URL = "http://localhost:11434/api";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OLLAMA);
      expect(result.modelName).toBe("llama3");
      expect(result.model).toBeDefined();
    });

    it("should configure Anthropic model correctly without Bedrock credentials", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.ANTHROPIC,
        aiModel: "claude-3-7-sonnet-20250219",
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

    it("should configure Azure model with low reasoning effort", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_PROVIDER = "azure";
      vi.mocked(env).DEFAULT_LLM_MODEL = "gpt-5-mini";
      vi.mocked(env).AZURE_API_KEY = "test-azure-key";
      vi.mocked(env).AZURE_RESOURCE_NAME = "test-azure-resource";
      vi.mocked(env).AZURE_API_VERSION = "2024-10-21";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.AZURE);
      expect(result.modelName).toBe("gpt-5-mini");
      expect(result.providerOptions?.openai?.reasoningEffort).toBe("low");
      expect(result.model).toBeDefined();
    });

    it("should throw when Azure is selected without resource name", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_PROVIDER = "azure";
      vi.mocked(env).DEFAULT_LLM_MODEL = "gpt-5-mini";
      vi.mocked(env).AZURE_RESOURCE_NAME = undefined;

      expect(() => getModel(userAi)).toThrow(
        "AZURE_RESOURCE_NAME environment variable is not set",
      );
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

    it("should pass the configured Azure API key for economy model", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).ECONOMY_LLM_PROVIDER = "azure";
      vi.mocked(env).ECONOMY_LLM_MODEL = "gpt-5-mini";
      vi.mocked(env).AZURE_API_KEY = "test-azure-key";
      vi.mocked(env).AZURE_RESOURCE_NAME = "test-azure-resource";
      vi.mocked(env).AZURE_API_VERSION = "2024-10-21";

      const result = getModel(userAi, "economy");
      expect(result.provider).toBe(Provider.AZURE);
      expect(result.modelName).toBe("gpt-5-mini");
      expect(createAzure).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "test-azure-key" }),
      );
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

    it("should resolve ordered fallback models for default model type", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_PROVIDER = "bedrock";
      vi.mocked(env).DEFAULT_LLM_MODEL =
        "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
      vi.mocked(env).DEFAULT_LLM_FALLBACKS =
        "openrouter:anthropic/claude-sonnet-4.5,openai:gpt-5.1";
      vi.mocked(env).BEDROCK_ACCESS_KEY = "test-bedrock-key";
      vi.mocked(env).BEDROCK_SECRET_KEY = "test-bedrock-secret";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";
      vi.mocked(env).OPENAI_API_KEY = "test-openai-key";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.BEDROCK);
      expect(result.fallbackModels).toHaveLength(2);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPENROUTER,
        modelName: "anthropic/claude-sonnet-4.5",
      });
      expect(result.fallbackModels[1]).toMatchObject({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.1",
      });
    });

    it("should skip fallback models for users with their own API key", () => {
      const userAi: UserAIFields = {
        aiApiKey: "user-api-key",
        aiProvider: Provider.BEDROCK,
        aiModel: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      };

      vi.mocked(env).DEFAULT_LLM_FALLBACKS =
        "openrouter:anthropic/claude-sonnet-4.5,openai:gpt-5.1";

      const result = getModel(userAi);

      expect(result.fallbackModels).toEqual([]);
    });

    it("should skip fallback providers without configured credentials", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_PROVIDER = "bedrock";
      vi.mocked(env).DEFAULT_LLM_MODEL =
        "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
      vi.mocked(env).DEFAULT_LLM_FALLBACKS = "openrouter,openai:gpt-5.1";
      vi.mocked(env).BEDROCK_ACCESS_KEY = "test-bedrock-key";
      vi.mocked(env).BEDROCK_SECRET_KEY = "test-bedrock-secret";
      vi.mocked(env).OPENROUTER_API_KEY = undefined;
      vi.mocked(env).OPENAI_API_KEY = "test-openai-key";

      const result = getModel(userAi);

      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.1",
      });
    });

    it("should support deprecated backup env vars as fallback config", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).USE_BACKUP_MODEL = true;
      vi.mocked(env).OPENROUTER_BACKUP_MODEL = "google/gemini-2.5-flash";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

      const result = getModel(userAi);

      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPENROUTER,
        modelName: "google/gemini-2.5-flash",
      });
    });

    it("should skip fallback entries without explicit model names", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_PROVIDER = "bedrock";
      vi.mocked(env).DEFAULT_LLM_MODEL =
        "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
      vi.mocked(env).DEFAULT_LLM_FALLBACKS = "openrouter,openai:gpt-5.1";
      vi.mocked(env).BEDROCK_ACCESS_KEY = "test-bedrock-key";
      vi.mocked(env).BEDROCK_SECRET_KEY = "test-bedrock-secret";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";
      vi.mocked(env).OPENAI_API_KEY = "test-openai-key";

      const result = getModel(userAi);

      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.1",
      });
    });

    it("should skip Ollama fallback when OLLAMA_MODEL is not configured", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_FALLBACKS = "ollama:llama3";
      vi.mocked(env).OLLAMA_MODEL = undefined;

      const result = getModel(userAi);

      expect(result.fallbackModels).toEqual([]);
    });

    it("should configure OpenAI-compatible provider via env vars", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_PROVIDER = "openai-compatible";
      vi.mocked(env).OPENAI_COMPATIBLE_BASE_URL = "http://localhost:1234/v1";
      vi.mocked(env).OPENAI_COMPATIBLE_MODEL = "llama-3.2-3b-instruct";
      vi.mocked(env).OPENAI_COMPATIBLE_API_KEY = undefined;

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENAI_COMPATIBLE);
      expect(result.modelName).toBe("llama-3.2-3b-instruct");
      expect(result.model).toBeDefined();
    });

    it("should configure OpenAI-compatible provider without an API key", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_PROVIDER = "openai-compatible";
      vi.mocked(env).OPENAI_COMPATIBLE_BASE_URL = "http://localhost:1234/v1";
      vi.mocked(env).OPENAI_COMPATIBLE_MODEL = "llama-3.2-3b-instruct";
      vi.mocked(env).OPENAI_COMPATIBLE_API_KEY = undefined;

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENAI_COMPATIBLE);
      expect(result.modelName).toBe("llama-3.2-3b-instruct");
    });

    it("should skip OpenAI-compatible fallback when OPENAI_COMPATIBLE_MODEL is not set", () => {
      const userAi: UserAIFields = {
        aiApiKey: null,
        aiProvider: null,
        aiModel: null,
      };

      vi.mocked(env).DEFAULT_LLM_FALLBACKS = "openai-compatible:llama3";
      vi.mocked(env).OPENAI_COMPATIBLE_MODEL = undefined;

      const result = getModel(userAi);

      expect(result.fallbackModels).toEqual([]);
    });
  });
});
