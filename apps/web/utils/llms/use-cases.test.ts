import { beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "./config";
import { getModel } from "./model";
import type { SelectModel } from "./model";
import type { UserAIFields } from "./types";
import {
  getModelForUseCase,
  LLM_USE_CASE_MODEL_TYPES,
  LlmUseCase,
} from "./use-cases";

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
    DEFAULT_LLMS: "openrouter:openai/gpt-5.4-mini,openai:gpt-5.4-mini",
    DEFAULT_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    ECONOMY_LLMS:
      "openrouter:google/gemini-2.5-flash,anthropic:claude-3-5-haiku-latest",
    ECONOMY_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    CHAT_LLMS: "openrouter:moonshotai/kimi-k2,google:gemini-2.5-flash",
    CHAT_OPENROUTER_PROVIDERS: "Google Vertex,Anthropic",
    NANO_LLMS: undefined,
    DRAFT_LLMS: "openrouter:anthropic/claude-sonnet-4.6,openai:gpt-5.4-mini",
    LLM_API_KEY: undefined,
    OPENAI_API_KEY: "test-openai-key",
    AZURE_API_KEY: "test-azure-key",
    AZURE_RESOURCE_NAME: "test-azure-resource",
    AZURE_API_VERSION: "2024-10-21",
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

describe("LLM use cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps every product use case to the expected model role", () => {
    expect(Object.keys(LLM_USE_CASE_MODEL_TYPES).sort()).toEqual(
      Object.values(LlmUseCase).sort(),
    );
    expect(LLM_USE_CASE_MODEL_TYPES).toEqual({
      [LlmUseCase.AssistantChat]: "chat",
      [LlmUseCase.AutomationCheckInMessage]: "economy",
      [LlmUseCase.CalendarAvailability]: "default",
      [LlmUseCase.CategorizeSender]: "default",
      [LlmUseCase.CategorizeSendersBulk]: "economy",
      [LlmUseCase.ChatCompaction]: "economy",
      [LlmUseCase.ChatMemoryExtraction]: "economy",
      [LlmUseCase.CleanInbox]: "default",
      [LlmUseCase.ComposeAutocomplete]: "default",
      [LlmUseCase.DetectRecurringPattern]: "chat",
      [LlmUseCase.DigestEmailSummary]: "economy",
      [LlmUseCase.DocumentFiling]: "economy",
      [LlmUseCase.DraftAttachmentSelection]: "economy",
      [LlmUseCase.DraftFollowUp]: "draft",
      [LlmUseCase.DraftReply]: "draft",
      [LlmUseCase.EmailHistoryExtraction]: "economy",
      [LlmUseCase.EmailReportActionableRecommendations]: "default",
      [LlmUseCase.EmailReportEmailBehavior]: "economy",
      [LlmUseCase.EmailReportExecutiveSummary]: "default",
      [LlmUseCase.EmailReportLabelAnalysis]: "economy",
      [LlmUseCase.EmailReportResponsePatterns]: "default",
      [LlmUseCase.EmailReportSummaryGeneration]: "economy",
      [LlmUseCase.EmailReportUserPersona]: "default",
      [LlmUseCase.FindSnippets]: "chat",
      [LlmUseCase.KnowledgeExtraction]: "economy",
      [LlmUseCase.LearnedWritingStyleCompaction]: "economy",
      [LlmUseCase.McpAgent]: "economy",
      [LlmUseCase.MeetingBriefing]: "default",
      [LlmUseCase.MeetingWebSearch]: "economy",
      [LlmUseCase.ParseFilingReply]: "economy",
      [LlmUseCase.PersonaAnalysis]: "economy",
      [LlmUseCase.PromptToRules]: "chat",
      [LlmUseCase.ReplyContextCollector]: "economy",
      [LlmUseCase.ReplyMemoryExtraction]: "economy",
      [LlmUseCase.ReplyNudge]: "chat",
      [LlmUseCase.Summarise]: "default",
      [LlmUseCase.WritingStyleAnalysis]: "default",
    });
  });

  it.each([
    [LlmUseCase.CategorizeSender, "default"],
    [LlmUseCase.CategorizeSendersBulk, "economy"],
    [LlmUseCase.AssistantChat, "chat"],
    [LlmUseCase.DraftReply, "draft"],
  ] as const)("delegates %s to getModel with the matching role", (useCase, modelType) => {
    const userAi = defaultUserAi();

    expect(modelSnapshot(getModelForUseCase(userAi, useCase))).toEqual(
      modelSnapshot(getModel(userAi, modelType)),
    );
  });

  it("preserves the online model variant option", () => {
    const userAi = defaultUserAi();

    expect(
      modelSnapshot(
        getModelForUseCase(userAi, LlmUseCase.MeetingWebSearch, true),
      ),
    ).toEqual(modelSnapshot(getModel(userAi, "economy", true)));
  });
});

function defaultUserAi(overrides?: Partial<UserAIFields>): UserAIFields {
  return {
    aiProvider: Provider.OPENROUTER,
    aiModel: null,
    aiApiKey: null,
    ...overrides,
  };
}

function modelSnapshot(modelOptions: SelectModel) {
  return {
    provider: modelOptions.provider,
    modelName: modelOptions.modelName,
    providerOptions: modelOptions.providerOptions,
    fallbackModels: modelOptions.fallbackModels.map((fallback) => ({
      provider: fallback.provider,
      modelName: fallback.modelName,
      providerOptions: fallback.providerOptions,
    })),
    hasUserApiKey: modelOptions.hasUserApiKey,
  };
}
