import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getConfiguredRolePrimaryModelEntry,
  getModel,
  getResolvedDeploymentRolePrimaryModelEntry,
} from "./model";
import { Provider } from "./config";
import { env } from "@/env";
import type { UserAIFields } from "./types";
import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";
import { createGateway } from "@ai-sdk/gateway";
import { createVertex } from "@ai-sdk/google-vertex";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider-v2";

const TEST_AZURE_FOUNDRY_API_KEY = "test-azure-foundry-key";
const TEST_AZURE_FOUNDRY_BASE_URL = "https://foundry.example.com/openai/v1";

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

vi.mock("@ai-sdk/google-vertex", () => ({
  createVertex: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@ai-sdk/gateway", () => ({
  createGateway: vi.fn(() => (model: string) => ({ model })),
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
    DEFAULT_LLMS: "openrouter:openai/gpt-5.4-mini",
    DEFAULT_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    ECONOMY_LLMS: "openrouter:google/gemini-2.5-flash-preview-05-20",
    ECONOMY_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    CHAT_LLMS: "openrouter:moonshotai/kimi-k2",
    CHAT_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    NANO_LLMS: undefined,
    DRAFT_LLMS: undefined,
    LLM_API_KEY: undefined,
    OPENAI_API_KEY: "test-openai-key",
    AZURE_API_KEY: "test-azure-key",
    AZURE_RESOURCE_NAME: "test-azure-resource",
    AZURE_API_VERSION: "2024-10-21",
    AZURE_FOUNDRY_API_KEY: "test-azure-foundry-key",
    AZURE_FOUNDRY_BASE_URL: "https://foundry.example.com/openai/v1",
    GOOGLE_API_KEY: "test-google-key",
    GOOGLE_THINKING_BUDGET: undefined,
    GOOGLE_VERTEX_PROJECT: "test-vertex-project",
    GOOGLE_VERTEX_LOCATION: "us-central1",
    GOOGLE_VERTEX_CLIENT_EMAIL: undefined,
    GOOGLE_VERTEX_PRIVATE_KEY: undefined,
    GOOGLE_APPLICATION_CREDENTIALS: undefined,
    ANTHROPIC_API_KEY: "test-anthropic-key",
    GROQ_API_KEY: "test-groq-key",
    OPENROUTER_API_KEY: "test-openrouter-key",
    AI_GATEWAY_API_KEY: "test-ai-gateway-key",
    OLLAMA_BASE_URL: "http://localhost:11434/api",
    OLLAMA_MODEL: "llama3",
    OPENAI_COMPATIBLE_BASE_URL: "http://localhost:1234/v1",
    OPENAI_COMPATIBLE_MODEL: "llama-3.2-3b-instruct",
    OPENAI_COMPATIBLE_AUTH_HEADER: undefined,
    CLI_LLM_ENABLED: false,
    CODEX_CLI_ALLOW_NPX: false,
    CODEX_CLI_PATH: undefined,
    BEDROCK_REGION: "us-west-2",
    BEDROCK_ACCESS_KEY: "",
    BEDROCK_SECRET_KEY: "",
  },
}));

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
    setDefaultLlms("openrouter", "openai/gpt-5.4-mini");
    vi.mocked(env).DEFAULT_OPENROUTER_PROVIDERS = "Google Vertex,Anthropic";
    setEconomyLlms("openrouter", "google/gemini-2.5-flash-preview-05-20");
    vi.mocked(env).ECONOMY_OPENROUTER_PROVIDERS = "Google Vertex,Anthropic";
    setChatLlms("openrouter", "moonshotai/kimi-k2");
    vi.mocked(env).CHAT_OPENROUTER_PROVIDERS = "Google Vertex,Anthropic";
    vi.mocked(env).LLM_API_KEY = undefined;
    vi.mocked(env).OPENAI_API_KEY = "test-openai-key";
    vi.mocked(env).NANO_LLMS = undefined;
    vi.mocked(env).DRAFT_LLMS = undefined;
    vi.mocked(env).AZURE_API_KEY = "test-azure-key";
    vi.mocked(env).AZURE_RESOURCE_NAME = "test-azure-resource";
    vi.mocked(env).AZURE_API_VERSION = "2024-10-21";
    vi.mocked(env).AZURE_FOUNDRY_API_KEY = TEST_AZURE_FOUNDRY_API_KEY;
    vi.mocked(env).AZURE_FOUNDRY_BASE_URL = TEST_AZURE_FOUNDRY_BASE_URL;
    vi.mocked(env).GOOGLE_API_KEY = "test-google-key";
    vi.mocked(env).GOOGLE_VERTEX_PROJECT = "test-vertex-project";
    vi.mocked(env).GOOGLE_VERTEX_LOCATION = "us-central1";
    vi.mocked(env).GOOGLE_VERTEX_CLIENT_EMAIL = undefined;
    vi.mocked(env).GOOGLE_VERTEX_PRIVATE_KEY = undefined;
    vi.mocked(env).GOOGLE_APPLICATION_CREDENTIALS = undefined;
    vi.mocked(env).GOOGLE_THINKING_BUDGET = undefined;
    vi.mocked(env).ANTHROPIC_API_KEY = "test-anthropic-key";
    vi.mocked(env).GROQ_API_KEY = "test-groq-key";
    vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";
    vi.mocked(env).AI_GATEWAY_API_KEY = "test-ai-gateway-key";
    vi.mocked(env).OLLAMA_BASE_URL = "http://localhost:11434/api";
    vi.mocked(env).OLLAMA_MODEL = "llama3";
    vi.mocked(env).OPENAI_COMPATIBLE_BASE_URL = "http://localhost:1234/v1";
    vi.mocked(env).OPENAI_COMPATIBLE_MODEL = "llama-3.2-3b-instruct";
    vi.mocked(env).OPENAI_COMPATIBLE_AUTH_HEADER = undefined;
    vi.mocked(env).CLI_LLM_ENABLED = false;
    vi.mocked(env).CODEX_CLI_ALLOW_NPX = false;
    vi.mocked(env).CODEX_CLI_PATH = undefined;
    vi.mocked(env).BEDROCK_ACCESS_KEY = "";
    vi.mocked(env).BEDROCK_SECRET_KEY = "";
  });

  describe("getModel", () => {
    it("should use default provider and model when user has no API key", () => {
      const userAi = defaultUserAi();

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("openai/gpt-5.4-mini");
    });

    it("should use LLM_API_KEY when provider-specific OpenAI key is not set", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPEN_AI, "gpt-5.4-mini");
      vi.mocked(env).OPENAI_API_KEY = undefined;
      vi.mocked(env).LLM_API_KEY = "test-shared-ai-key";

      getModel(userAi);

      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "test-shared-ai-key" }),
      );
    });

    it("should use user's provider and model when API key is provided", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: "gemini-1.5-pro-latest",
      });

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GOOGLE);
      expect(result.modelName).toBe("gemini-1.5-pro-latest");
    });

    it("should use user's API key with default provider when only API key is provided", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
      });

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("openai/gpt-5.4-mini");
    });

    it("should configure Google model correctly", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: "gemini-1.5-pro-latest",
      });

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GOOGLE);
      expect(result.modelName).toBe("gemini-1.5-pro-latest");
      expect(result.model).toBeDefined();
      expect(result.providerOptions).toEqual({
        google: {
          thinkingConfig: {
            thinkingBudget: 128,
          },
        },
      });
    });

    it("should configure Gemini 3 Google model with thinking level", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: "gemini-3-pro-preview",
      });

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.GOOGLE);
      expect(result.modelName).toBe("gemini-3-pro-preview");
      expect(result.providerOptions).toEqual({
        google: {
          thinkingConfig: {
            thinkingLevel: "minimal",
          },
        },
      });
    });

    it("should allow overriding Google thinking budget via env", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: "gemini-2.5-flash",
      });

      vi.mocked(env).GOOGLE_THINKING_BUDGET = 32;

      const result = getModel(userAi);

      expect(result.providerOptions).toEqual({
        google: {
          thinkingConfig: {
            thinkingBudget: 32,
          },
        },
      });
    });

    it("should omit Google thinking budget when the env override is 0", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: "gemini-2.5-flash-lite",
      });

      vi.mocked(env).GOOGLE_THINKING_BUDGET = 0;

      const result = getModel(userAi);

      expect(result.providerOptions).toBeUndefined();
    });

    it("should configure Vertex model correctly", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.VERTEX, "gemini-2.5-flash");
      vi.mocked(env).GOOGLE_VERTEX_PROJECT = "test-vertex-project";
      vi.mocked(env).GOOGLE_VERTEX_LOCATION = "us-central1";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.VERTEX);
      expect(result.modelName).toBe("gemini-2.5-flash");
      expect(result.model).toBeDefined();
      expect(result.providerOptions).toEqual({
        vertex: {
          thinkingConfig: {
            thinkingBudget: 128,
          },
        },
      });
      expect(createVertex).toHaveBeenCalledWith({
        project: "test-vertex-project",
        location: "us-central1",
      });
    });

    it("should configure Vertex model with inline service account credentials", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.VERTEX, "gemini-2.5-flash");
      vi.mocked(env).GOOGLE_VERTEX_PROJECT = "test-vertex-project";
      vi.mocked(env).GOOGLE_VERTEX_LOCATION = "us-central1";
      vi.mocked(env).GOOGLE_VERTEX_CLIENT_EMAIL =
        "service-account@test.iam.gserviceaccount.com";
      vi.mocked(env).GOOGLE_VERTEX_PRIVATE_KEY = "line1\\nline2";

      const result = getModel(userAi);

      expect(result.providerOptions).toEqual({
        vertex: {
          thinkingConfig: {
            thinkingBudget: 128,
          },
        },
      });

      expect(createVertex).toHaveBeenCalledWith({
        project: "test-vertex-project",
        location: "us-central1",
        googleAuthOptions: {
          credentials: {
            client_email: "service-account@test.iam.gserviceaccount.com",
            private_key: "line1\nline2",
          },
        },
      });
    });

    it("should configure Gemini 3 Vertex model with thinking level", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.VERTEX, "gemini-3-flash");
      vi.mocked(env).GOOGLE_VERTEX_PROJECT = "test-vertex-project";
      vi.mocked(env).GOOGLE_VERTEX_LOCATION = "us-central1";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.VERTEX);
      expect(result.modelName).toBe("gemini-3-flash");
      expect(result.providerOptions).toEqual({
        vertex: {
          thinkingConfig: {
            thinkingLevel: "minimal",
          },
        },
      });
    });

    it("should configure Groq model correctly", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.GROQ,
        aiModel: "llama-3.3-70b-versatile",
      });

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.GROQ);
      expect(result.modelName).toBe("llama-3.3-70b-versatile");
      expect(result.model).toBeDefined();
    });

    it("should configure OpenRouter model correctly", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.OPENROUTER,
        aiModel: "llama-3.3-70b-versatile",
      });

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("llama-3.3-70b-versatile");
      expect(result.model).toBeDefined();
    });

    it("should configure AI Gateway Gemini 3 model with minimal thinking", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.AI_GATEWAY, "google/gemini-3-flash");

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.AI_GATEWAY);
      expect(result.modelName).toBe("google/gemini-3-flash");
      expect(result.providerOptions).toEqual({
        google: {
          thinkingConfig: {
            thinkingLevel: "minimal",
          },
        },
      });
    });

    it("should configure AI Gateway Gemini 2.5 model with the configured thinking budget", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.AI_GATEWAY, "google/gemini-2.5-flash");
      vi.mocked(env).GOOGLE_THINKING_BUDGET = 48;

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.AI_GATEWAY);
      expect(result.modelName).toBe("google/gemini-2.5-flash");
      expect(result.providerOptions).toEqual({
        google: {
          thinkingConfig: {
            thinkingBudget: 48,
          },
        },
      });
    });

    it("should configure AI Gateway OpenAI model with low reasoning effort", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.AI_GATEWAY, "openai/gpt-5.4-mini");

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.AI_GATEWAY);
      expect(result.modelName).toBe("openai/gpt-5.4-mini");
      expect(result.providerOptions).toEqual({
        openai: {
          reasoningEffort: "low",
          reasoningSummary: "concise",
        },
      });
      expect(createGateway).toHaveBeenCalledWith({
        apiKey: "test-ai-gateway-key",
        headers: {
          "http-referer": "https://www.getinboxzero.com",
          "x-title": "Inbox Zero",
        },
      });
    });

    it("should configure AI Gateway Azure model with low reasoning effort", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.AI_GATEWAY, "azure/my-mini-deployment");

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.AI_GATEWAY);
      expect(result.modelName).toBe("azure/my-mini-deployment");
      expect(result.providerOptions).toEqual({
        openai: {
          reasoningEffort: "low",
          reasoningSummary: "concise",
        },
      });
    });

    it("should configure Ollama model via DEFAULT_LLMS", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OLLAMA, "llama3.2");
      vi.mocked(env).OLLAMA_MODEL = undefined;
      vi.mocked(env).OLLAMA_BASE_URL = "http://localhost:11434/api";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OLLAMA);
      expect(result.modelName).toBe("llama3.2");
      expect(result.model).toBeDefined();
    });

    it("should configure Ollama model via legacy OLLAMA_MODEL", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OLLAMA, "llama3");
      vi.mocked(env).OLLAMA_MODEL = "llama3";
      vi.mocked(env).OLLAMA_BASE_URL = "http://localhost:11434/api";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OLLAMA);
      expect(result.modelName).toBe("llama3");
      expect(result.model).toBeDefined();
    });

    it("should accept an Ollama server origin without /api", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OLLAMA, "llama3.2");
      vi.mocked(env).OLLAMA_BASE_URL = "http://localhost:11434";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OLLAMA);
      expect(createOllama).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/api",
      });
    });

    it("should preserve explicit Ollama API base URLs", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OLLAMA, "llama3.2");
      vi.mocked(env).OLLAMA_BASE_URL = "http://localhost:11434/api/";

      getModel(userAi);

      expect(createOllama).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/api",
      });
    });

    it("should configure Anthropic model correctly without Bedrock credentials", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.ANTHROPIC,
        aiModel: "claude-3-7-sonnet-20250219",
      });

      vi.mocked(env).BEDROCK_ACCESS_KEY = "";
      vi.mocked(env).BEDROCK_SECRET_KEY = "";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.ANTHROPIC);
      expect(result.modelName).toBe("claude-3-7-sonnet-20250219");
      expect(result.model).toBeDefined();
    });

    it("should configure Bedrock model correctly via env vars", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(
        Provider.BEDROCK,
        "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
      );
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
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.AZURE, "my-mini-deployment");
      vi.mocked(env).AZURE_API_KEY = "test-azure-key";
      vi.mocked(env).AZURE_RESOURCE_NAME = "test-azure-resource";
      vi.mocked(env).AZURE_API_VERSION = "2024-10-21";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.AZURE);
      expect(result.modelName).toBe("my-mini-deployment");
      expect(result.providerOptions?.openai?.reasoningEffort).toBe("low");
      expect(result.model).toBeDefined();
    });

    it("should skip Azure list entries without a resource name", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.AZURE, "my-mini-deployment", [
        "openai:gpt-5.4-mini",
      ]);
      vi.mocked(env).AZURE_RESOURCE_NAME = undefined;

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.4-mini");
    });

    it("should configure Azure Foundry provider via DEFAULT_LLMS", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.AZURE_FOUNDRY, "deployment-name");
      vi.mocked(env).AZURE_FOUNDRY_API_KEY = TEST_AZURE_FOUNDRY_API_KEY;
      vi.mocked(env).AZURE_FOUNDRY_BASE_URL = TEST_AZURE_FOUNDRY_BASE_URL;

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.AZURE_FOUNDRY);
      expect(result.modelName).toBe("deployment-name");
      expect(createOpenAICompatible).toHaveBeenCalledWith({
        name: "azure-foundry",
        baseURL: TEST_AZURE_FOUNDRY_BASE_URL,
        supportsStructuredOutputs: true,
        headers: { "api-key": TEST_AZURE_FOUNDRY_API_KEY },
      });
    });

    it("should skip Azure Foundry list entries without an API key", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.AZURE_FOUNDRY, "deployment-name", [
        "openai:gpt-5.4-mini",
      ]);
      vi.mocked(env).AZURE_FOUNDRY_API_KEY = undefined;
      vi.mocked(env).AZURE_FOUNDRY_BASE_URL = TEST_AZURE_FOUNDRY_BASE_URL;
      vi.mocked(env).LLM_API_KEY = "test-shared-ai-key";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.4-mini");
    });

    it("should skip Azure Foundry list entries without a base URL", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.AZURE_FOUNDRY, "deployment-name", [
        "openai:gpt-5.4-mini",
      ]);
      vi.mocked(env).AZURE_FOUNDRY_API_KEY = TEST_AZURE_FOUNDRY_API_KEY;
      vi.mocked(env).AZURE_FOUNDRY_BASE_URL = undefined;

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.4-mini");
    });

    it("should use Azure Foundry as an ordered fallback entry", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPEN_AI, "gpt-5.4-mini", [
        "azure-foundry:deployment-name",
      ]);
      vi.mocked(env).AZURE_FOUNDRY_API_KEY = TEST_AZURE_FOUNDRY_API_KEY;
      vi.mocked(env).AZURE_FOUNDRY_BASE_URL = TEST_AZURE_FOUNDRY_BASE_URL;

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.AZURE_FOUNDRY,
        modelName: "deployment-name",
      });
    });

    it("should skip Vertex list entries without a project", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.VERTEX, "gemini-2.5-flash", [
        "openai:gpt-5.4-mini",
      ]);
      vi.mocked(env).GOOGLE_VERTEX_PROJECT = undefined;

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.4-mini");
    });

    it("should throw error for unsupported provider", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: "unsupported" as any,
        aiModel: "some-model",
      });

      expect(() => getModel(userAi)).toThrow("LLM provider not supported");
    });

    it("should use economy model when modelType is 'economy'", () => {
      const userAi = defaultUserAi();

      setEconomyLlms(
        Provider.OPENROUTER,
        "google/gemini-2.5-flash-preview-05-20",
      );
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

      const result = getModel(userAi, "economy");
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("google/gemini-2.5-flash-preview-05-20");
    });

    it("should use nano model when modelType is 'nano' and nano model is configured", () => {
      const userAi = defaultUserAi();

      setNanoLlms(Provider.OPEN_AI, "gpt-5.4-nano");

      const result = getModel(userAi, "nano");

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.4-nano");
    });

    it("should use OpenRouter provider options for nano when nano provider is OpenRouter", () => {
      const userAi = defaultUserAi();

      setNanoLlms(Provider.OPENROUTER, "openai/gpt-5.4-nano");
      vi.mocked(env).ECONOMY_OPENROUTER_PROVIDERS = "Google Vertex,Anthropic";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

      const result = getModel(userAi, "nano");

      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("openai/gpt-5.4-nano");
      expect(result.providerOptions).toEqual({
        openrouter: {
          provider: { order: ["Google Vertex", "Anthropic"] },
          reasoning: { max_tokens: 20 },
        },
      });
    });

    it("should fall back to economy model when nano model is not configured", () => {
      const userAi = defaultUserAi();

      vi.mocked(env).NANO_LLMS = undefined;

      const result = getModel(userAi, "nano");

      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("google/gemini-2.5-flash-preview-05-20");
    });

    it("should pass the configured Azure API key for economy model", () => {
      const userAi = defaultUserAi();

      setEconomyLlms(Provider.AZURE, "my-mini-deployment");
      vi.mocked(env).AZURE_API_KEY = "test-azure-key";
      vi.mocked(env).AZURE_RESOURCE_NAME = "test-azure-resource";
      vi.mocked(env).AZURE_API_VERSION = "2024-10-21";

      const result = getModel(userAi, "economy");
      expect(result.provider).toBe(Provider.AZURE);
      expect(result.modelName).toBe("my-mini-deployment");
      expect(createAzure).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "test-azure-key" }),
      );
    });

    it("should use OpenRouter with provider options for economy", () => {
      const userAi = defaultUserAi();

      setEconomyLlms(
        Provider.OPENROUTER,
        "google/gemini-2.5-flash-preview-05-20",
      );
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

    it("should enable usage accounting for OpenRouter models", () => {
      const userAi = defaultUserAi();

      setEconomyLlms(Provider.OPENROUTER, "openai/gpt-5.4-mini");
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

      getModel(userAi, "economy");

      const openRouterFactory = vi
        .mocked(createOpenRouter)
        .mock.results.at(-1)?.value;

      expect(openRouterFactory?.chat).toHaveBeenCalledWith(
        "openai/gpt-5.4-mini",
        {
          usage: {
            include: true,
          },
        },
      );
    });

    it("should use default model when modelType is 'default'", () => {
      const userAi = defaultUserAi();

      const result = getModel(userAi, "default");
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("openai/gpt-5.4-mini");
    });

    it("should use OpenRouter with provider options for default model", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPENROUTER, "anthropic/claude-3.5-sonnet");
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

    it("should not include OpenRouter reasoning max_tokens for Grok models", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPENROUTER, "x-ai/grok-4.1-fast");
      vi.mocked(env).DEFAULT_OPENROUTER_PROVIDERS = "Google Vertex,Anthropic";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

      const result = getModel(userAi, "default");
      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("x-ai/grok-4.1-fast");
      expect(result.providerOptions?.openrouter?.provider?.order).toEqual([
        "Google Vertex",
        "Anthropic",
      ]);
      expect(result.providerOptions?.openrouter?.reasoning).toBeUndefined();
    });

    it("should resolve DEFAULT_LLMS as primary plus ordered fallbacks", () => {
      const userAi = defaultUserAi();

      vi.mocked(env).DEFAULT_LLMS =
        "azure:my-gpt-5-4-mini-deployment,openrouter:anthropic/claude-sonnet-4.6,openai:gpt-5.4-mini";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.AZURE);
      expect(result.modelName).toBe("my-gpt-5-4-mini-deployment");
      expect(result.fallbackModels).toHaveLength(2);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPENROUTER,
        modelName: "anthropic/claude-sonnet-4.6",
      });
      expect(result.fallbackModels[1]).toMatchObject({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.4-mini",
      });
    });

    it("should let role-specific LLMS override only their own role", () => {
      const userAi = defaultUserAi();

      vi.mocked(env).ECONOMY_LLMS = "openai:gpt-economy";
      vi.mocked(env).CHAT_LLMS = "azure:gpt-chat";
      vi.mocked(env).NANO_LLMS = "google:gemini-2.5-flash-lite";
      vi.mocked(env).DRAFT_LLMS = "anthropic:claude-draft";

      expect(getModel(userAi, "default")).toMatchObject({
        provider: Provider.OPENROUTER,
        modelName: "openai/gpt-5.4-mini",
      });
      expect(getModel(userAi, "economy")).toMatchObject({
        provider: Provider.OPEN_AI,
        modelName: "gpt-economy",
      });
      expect(getModel(userAi, "chat")).toMatchObject({
        provider: Provider.AZURE,
        modelName: "gpt-chat",
      });
      expect(getModel(userAi, "nano")).toMatchObject({
        provider: Provider.GOOGLE,
        modelName: "gemini-2.5-flash-lite",
      });
      expect(getModel(userAi, "draft")).toMatchObject({
        provider: Provider.ANTHROPIC,
        modelName: "claude-draft",
      });
    });

    it("should fall back to default role when a role list resolves no entries", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPEN_AI, "gpt-5.4-mini");
      vi.mocked(env).ECONOMY_LLMS =
        "unsupported:model,bedrock:global.anthropic.claude-sonnet-4-6";
      vi.mocked(env).BEDROCK_ACCESS_KEY = "";
      vi.mocked(env).BEDROCK_SECRET_KEY = "";

      const result = getModel(userAi, "economy");

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.4-mini");
    });

    it("should preserve model names containing colons in LLMS entries", () => {
      const userAi = defaultUserAi();

      vi.mocked(env).DEFAULT_LLMS =
        "bedrock:global.anthropic.claude-haiku-4-5-20251001-v1:0,openai:gpt-5.4-mini";
      vi.mocked(env).BEDROCK_ACCESS_KEY = "test-bedrock-key";
      vi.mocked(env).BEDROCK_SECRET_KEY = "test-bedrock-secret";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.BEDROCK);
      expect(result.modelName).toBe(
        "global.anthropic.claude-haiku-4-5-20251001-v1:0",
      );
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.4-mini",
      });
    });

    it("should skip LLMS entries without configured credentials", () => {
      const userAi = defaultUserAi();

      vi.mocked(env).DEFAULT_LLMS =
        "bedrock:global.anthropic.claude-sonnet-4-6,openai:gpt-5.4-mini";
      vi.mocked(env).BEDROCK_ACCESS_KEY = "";
      vi.mocked(env).BEDROCK_SECRET_KEY = "";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.4-mini");
      expect(result.fallbackModels).toEqual([]);
    });

    it("should return the first credentialed primary model entry", () => {
      vi.mocked(env).DEFAULT_LLMS =
        "bedrock:global.anthropic.claude-sonnet-4-6,openai:gpt-5.4-mini";
      vi.mocked(env).BEDROCK_ACCESS_KEY = "";
      vi.mocked(env).BEDROCK_SECRET_KEY = "";

      expect(getConfiguredRolePrimaryModelEntry("default")).toEqual({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.4-mini",
      });
    });

    it("should return the resolved deployment role primary entry with role fallbacks", () => {
      setDefaultLlms(Provider.OPEN_AI, "gpt-5.4-mini");
      vi.mocked(env).ECONOMY_LLMS = undefined;

      expect(getResolvedDeploymentRolePrimaryModelEntry("economy")).toEqual({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.4-mini",
      });
    });

    it("should omit duplicate LLMS entries from fallbacks", () => {
      const userAi = defaultUserAi();

      vi.mocked(env).DEFAULT_LLMS =
        "openai:gpt-5.4-mini,openai:gpt-5.4-mini,openrouter:anthropic/claude-sonnet-4.6,openrouter:anthropic/claude-sonnet-4.6";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.4-mini");
      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPENROUTER,
        modelName: "anthropic/claude-sonnet-4.6",
      });
    });

    it("should skip deployment LLMS and fallbacks for users with their own API key", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.GOOGLE,
        aiModel: "gemini-1.5-pro-latest",
      });

      vi.mocked(env).DEFAULT_LLMS =
        "openai:gpt-5.4-mini,openrouter:anthropic/claude-sonnet-4.6";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.GOOGLE);
      expect(result.modelName).toBe("gemini-1.5-pro-latest");
      expect(result.fallbackModels).toEqual([]);
    });

    it("should preserve OpenRouter provider options for LLMS entries", () => {
      const userAi = defaultUserAi();

      vi.mocked(env).DEFAULT_LLMS =
        "openrouter:anthropic/claude-sonnet-4.6,openrouter:x-ai/grok-4.1-fast";
      vi.mocked(env).DEFAULT_OPENROUTER_PROVIDERS = "Google Vertex,Anthropic";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPENROUTER);
      expect(result.modelName).toBe("anthropic/claude-sonnet-4.6");
      expect(result.providerOptions).toEqual({
        openrouter: {
          provider: { order: ["Google Vertex", "Anthropic"] },
          reasoning: { max_tokens: 20 },
        },
      });
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPENROUTER,
        modelName: "x-ai/grok-4.1-fast",
      });
      expect(
        result.fallbackModels[0].providerOptions?.openrouter?.provider?.order,
      ).toEqual(["Google Vertex", "Anthropic"]);
      expect(
        result.fallbackModels[0].providerOptions?.openrouter?.reasoning,
      ).toBeUndefined();
    });

    it("should resolve ordered fallback models for default model type", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.BEDROCK, "global.anthropic.claude-sonnet-4-6", [
        "openrouter:anthropic/claude-sonnet-4.6",
        "openai:gpt-5.4-mini",
      ]);
      vi.mocked(env).BEDROCK_ACCESS_KEY = "test-bedrock-key";
      vi.mocked(env).BEDROCK_SECRET_KEY = "test-bedrock-secret";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";
      vi.mocked(env).OPENAI_API_KEY = "test-openai-key";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.BEDROCK);
      expect(result.fallbackModels).toHaveLength(2);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPENROUTER,
        modelName: "anthropic/claude-sonnet-4.6",
      });
      expect(result.fallbackModels[1]).toMatchObject({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.4-mini",
      });
    });

    it("should omit OpenRouter reasoning options for Grok fallback models", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPEN_AI, "gpt-5.4-mini", [
        "openrouter:x-ai/grok-4.1-fast",
      ]);
      vi.mocked(env).OPENAI_API_KEY = "test-openai-key";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPENROUTER,
        modelName: "x-ai/grok-4.1-fast",
      });
      expect(
        result.fallbackModels[0].providerOptions?.openrouter?.reasoning,
      ).toBeUndefined();
    });

    it("should skip fallback models for users with their own API key", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.BEDROCK,
        aiModel: "global.anthropic.claude-sonnet-4-6",
      });

      setDefaultLlms(Provider.OPEN_AI, "gpt-5.4-mini", [
        "openrouter:anthropic/claude-sonnet-4.6",
        "openai:gpt-5.4-mini",
      ]);

      const result = getModel(userAi);

      expect(result.fallbackModels).toEqual([]);
    });

    it("should skip fallback providers without configured credentials", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.BEDROCK, "global.anthropic.claude-sonnet-4-6", [
        "openrouter",
        "openai:gpt-5.4-mini",
      ]);
      vi.mocked(env).BEDROCK_ACCESS_KEY = "test-bedrock-key";
      vi.mocked(env).BEDROCK_SECRET_KEY = "test-bedrock-secret";
      vi.mocked(env).OPENROUTER_API_KEY = undefined;
      vi.mocked(env).OPENAI_API_KEY = "test-openai-key";

      const result = getModel(userAi);

      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.4-mini",
      });
    });

    it("should use LLM_API_KEY for fallback providers when provider key is not set", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.BEDROCK, "global.anthropic.claude-sonnet-4-6", [
        "openai:gpt-5.4-mini",
      ]);
      vi.mocked(env).BEDROCK_ACCESS_KEY = "test-bedrock-key";
      vi.mocked(env).BEDROCK_SECRET_KEY = "test-bedrock-secret";
      vi.mocked(env).OPENAI_API_KEY = undefined;
      vi.mocked(env).LLM_API_KEY = "test-shared-ai-key";

      const result = getModel(userAi);

      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.4-mini",
      });
    });

    it("should skip fallback entries without explicit model names", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.BEDROCK, "global.anthropic.claude-sonnet-4-6", [
        "openrouter",
        "openai:gpt-5.4-mini",
      ]);
      vi.mocked(env).BEDROCK_ACCESS_KEY = "test-bedrock-key";
      vi.mocked(env).BEDROCK_SECRET_KEY = "test-bedrock-secret";
      vi.mocked(env).OPENROUTER_API_KEY = "test-openrouter-key";
      vi.mocked(env).OPENAI_API_KEY = "test-openai-key";

      const result = getModel(userAi);

      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPEN_AI,
        modelName: "gpt-5.4-mini",
      });
    });

    it("should use explicit Ollama fallback model without OLLAMA_MODEL", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPEN_AI, "gpt-5.4-mini", ["ollama:llama3"]);
      vi.mocked(env).OLLAMA_MODEL = undefined;

      const result = getModel(userAi);

      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OLLAMA,
        modelName: "llama3",
      });
    });

    it("should configure OpenAI-compatible provider via DEFAULT_LLMS", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPENAI_COMPATIBLE, "llama-3.2-3b-instruct");
      vi.mocked(env).OPENAI_COMPATIBLE_BASE_URL = "http://localhost:1234/v1";
      vi.mocked(env).OPENAI_COMPATIBLE_MODEL = undefined;

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENAI_COMPATIBLE);
      expect(result.modelName).toBe("llama-3.2-3b-instruct");
      expect(result.model).toBeDefined();
      expect(createOpenAICompatible).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "openai-compatible",
          baseURL: "http://localhost:1234/v1",
          supportsStructuredOutputs: true,
        }),
      );
    });

    it("should configure OpenAI-compatible user provider via OPENAI_COMPATIBLE_MODEL", () => {
      const userAi = defaultUserAi({
        aiApiKey: "user-api-key",
        aiProvider: Provider.OPENAI_COMPATIBLE,
      });

      vi.mocked(env).OPENAI_COMPATIBLE_BASE_URL = "http://localhost:1234/v1";
      vi.mocked(env).OPENAI_COMPATIBLE_MODEL = "llama-3.2-3b-instruct";

      const result = getModel(userAi);
      expect(result.provider).toBe(Provider.OPENAI_COMPATIBLE);
      expect(result.modelName).toBe("llama-3.2-3b-instruct");
    });

    it("should support API-key header auth for OpenAI-compatible providers", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPENAI_COMPATIBLE, "provider-deployment");
      vi.mocked(env).OPENAI_COMPATIBLE_BASE_URL =
        "https://provider.example.com/openai/v1";
      vi.mocked(env).OPENAI_COMPATIBLE_AUTH_HEADER = "api-key";
      vi.mocked(env).LLM_API_KEY = "test-provider-key";

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPENAI_COMPATIBLE);
      expect(result.modelName).toBe("provider-deployment");
      expect(createOpenAICompatible).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { "api-key": "test-provider-key" },
        }),
      );
      expect(createOpenAICompatible).toHaveBeenCalledWith(
        expect.not.objectContaining({
          apiKey: "test-provider-key",
        }),
      );
    });

    it("should use process env for OpenAI-compatible settings when env is partially mocked", () => {
      const userAi = defaultUserAi();
      const originalProcessEnv = {
        LLM_API_KEY: process.env.LLM_API_KEY,
        OPENAI_COMPATIBLE_BASE_URL: process.env.OPENAI_COMPATIBLE_BASE_URL,
        OPENAI_COMPATIBLE_AUTH_HEADER:
          process.env.OPENAI_COMPATIBLE_AUTH_HEADER,
      };

      try {
        setDefaultLlms(Provider.OPENAI_COMPATIBLE, "provider-deployment");
        vi.mocked(env).LLM_API_KEY = undefined;
        vi.mocked(env).OPENAI_COMPATIBLE_BASE_URL = undefined;
        vi.mocked(env).OPENAI_COMPATIBLE_AUTH_HEADER = undefined;
        process.env.LLM_API_KEY = "test-process-key";
        process.env.OPENAI_COMPATIBLE_BASE_URL =
          "https://provider.example.com/openai/v1";
        process.env.OPENAI_COMPATIBLE_AUTH_HEADER = "api-key";

        const result = getModel(userAi);

        expect(result.provider).toBe(Provider.OPENAI_COMPATIBLE);
        expect(createOpenAICompatible).toHaveBeenCalledWith(
          expect.objectContaining({
            baseURL: "https://provider.example.com/openai/v1",
            headers: { "api-key": "test-process-key" },
          }),
        );
      } finally {
        restoreProcessEnv(originalProcessEnv);
      }
    });

    it("should use explicit OpenAI-compatible fallback model without OPENAI_COMPATIBLE_MODEL", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPEN_AI, "gpt-5.4-mini", [
        "openai-compatible:llama3",
      ]);
      vi.mocked(env).OPENAI_COMPATIBLE_MODEL = undefined;

      const result = getModel(userAi);

      expect(result.fallbackModels).toHaveLength(1);
      expect(result.fallbackModels[0]).toMatchObject({
        provider: Provider.OPENAI_COMPATIBLE,
        modelName: "llama3",
      });
    });

    it("should skip disabled CLI LLM providers", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.CODEX_CLI, "gpt-5.3-codex", [
        "openai:gpt-5.4-mini",
      ]);
      vi.mocked(env).CLI_LLM_ENABLED = false;

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.OPEN_AI);
      expect(result.modelName).toBe("gpt-5.4-mini");
    });

    it("should configure Codex CLI provider when explicitly enabled", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.CODEX_CLI, "gpt-5.3-codex");
      vi.mocked(env).CLI_LLM_ENABLED = true;

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.CODEX_CLI);
      expect(result.modelName).toBe("gpt-5.3-codex");
      expect(result.model).toMatchObject({
        provider: Provider.CODEX_CLI,
        modelId: "gpt-5.3-codex",
      });
    });

    it("should configure Claude Code provider when explicitly enabled", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.CLAUDE_CODE, "sonnet");
      vi.mocked(env).CLI_LLM_ENABLED = true;

      const result = getModel(userAi);

      expect(result.provider).toBe(Provider.CLAUDE_CODE);
      expect(result.modelName).toBe("sonnet");
      expect(result.model).toMatchObject({
        provider: Provider.CLAUDE_CODE,
        modelId: "sonnet",
      });
    });

    it("should skip CLI fallback providers when CLI LLMs are disabled", () => {
      const userAi = defaultUserAi();

      setDefaultLlms(Provider.OPEN_AI, "gpt-5.4-mini", [
        "codex-cli:gpt-5.3-codex",
      ]);
      vi.mocked(env).CLI_LLM_ENABLED = false;

      const result = getModel(userAi);

      expect(result.fallbackModels).toEqual([]);
    });
  });
});

function defaultUserAi(overrides: Partial<UserAIFields> = {}): UserAIFields {
  return {
    aiApiKey: null,
    aiProvider: null,
    aiModel: null,
    ...overrides,
  };
}

function setDefaultLlms(
  provider: string,
  modelName: string,
  fallbacks: string[] = [],
) {
  vi.mocked(env).DEFAULT_LLMS = [`${provider}:${modelName}`, ...fallbacks].join(
    ",",
  );
}

function setEconomyLlms(
  provider: string,
  modelName: string,
  fallbacks: string[] = [],
) {
  vi.mocked(env).ECONOMY_LLMS = [`${provider}:${modelName}`, ...fallbacks].join(
    ",",
  );
}

function setChatLlms(
  provider: string,
  modelName: string,
  fallbacks: string[] = [],
) {
  vi.mocked(env).CHAT_LLMS = [`${provider}:${modelName}`, ...fallbacks].join(
    ",",
  );
}

function setNanoLlms(
  provider: string,
  modelName: string,
  fallbacks: string[] = [],
) {
  vi.mocked(env).NANO_LLMS = [`${provider}:${modelName}`, ...fallbacks].join(
    ",",
  );
}

function restoreProcessEnv(values: {
  LLM_API_KEY: string | undefined;
  OPENAI_COMPATIBLE_BASE_URL: string | undefined;
  OPENAI_COMPATIBLE_AUTH_HEADER: string | undefined;
}) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
