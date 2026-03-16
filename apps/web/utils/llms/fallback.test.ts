import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGenerateText } from "./index";
import type { SelectModel } from "./model";

const {
  mockGenerateText,
  mockSaveAiUsage,
  mockWithLLMRetry,
  mockWithNetworkRetry,
  mockExtractLLMErrorInfo,
  mockIsTransientNetworkError,
  mockWithTracing,
  mockGetPosthogLlmClient,
  mockIsPosthogLlmEvalApproved,
} = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockSaveAiUsage: vi.fn(),
  mockWithLLMRetry: vi.fn(),
  mockWithNetworkRetry: vi.fn(),
  mockExtractLLMErrorInfo: vi.fn(),
  mockIsTransientNetworkError: vi.fn(),
  mockWithTracing: vi.fn(),
  mockGetPosthogLlmClient: vi.fn(),
  mockIsPosthogLlmEvalApproved: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: mockGenerateText,
  };
});

vi.mock("@/utils/usage", () => ({
  saveAiUsage: mockSaveAiUsage,
}));

vi.mock("@/utils/posthog", () => ({
  getPosthogLlmClient: mockGetPosthogLlmClient,
  isPosthogLlmEvalApproved: mockIsPosthogLlmEvalApproved,
}));

vi.mock("@posthog/ai/vercel", () => ({
  withTracing: mockWithTracing,
}));

vi.mock("./retry", async () => {
  const actual = await vi.importActual<typeof import("./retry")>("./retry");
  return {
    ...actual,
    withLLMRetry: mockWithLLMRetry,
    withNetworkRetry: mockWithNetworkRetry,
    extractLLMErrorInfo: mockExtractLLMErrorInfo,
    isTransientNetworkError: mockIsTransientNetworkError,
  };
});

describe("createGenerateText fallback chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockWithLLMRetry.mockImplementation(
      async (operation: () => Promise<unknown>) => operation(),
    );
    mockWithNetworkRetry.mockImplementation(
      async (operation: () => Promise<unknown>) => operation(),
    );
    mockExtractLLMErrorInfo.mockReturnValue({
      retryable: false,
      isRateLimit: false,
      retryAfterMs: undefined,
    });
    mockIsTransientNetworkError.mockReturnValue(false);
    mockGetPosthogLlmClient.mockReturnValue({ capture: vi.fn() });
    mockIsPosthogLlmEvalApproved.mockReturnValue(false);
    mockWithTracing.mockImplementation((model) => model);
    mockSaveAiUsage.mockResolvedValue(undefined);
  });

  it("falls back to the next provider on retryable provider failures", async () => {
    const primaryModel = { id: "primary-model" };
    const fallbackModel = { id: "fallback-model" };

    const modelOptions: SelectModel = {
      provider: "bedrock",
      modelName: "primary",
      model: primaryModel as SelectModel["model"],
      providerOptions: undefined,
      fallbackModels: [
        {
          provider: "openrouter",
          modelName: "fallback",
          model: fallbackModel as SelectModel["model"],
          providerOptions: undefined,
        },
      ],
      hasUserApiKey: false,
    };

    const retryableError = new Error("rate limited");
    mockExtractLLMErrorInfo.mockReturnValueOnce({
      retryable: true,
      isRateLimit: true,
      retryAfterMs: undefined,
    });

    mockGenerateText
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce({
        text: "fallback success",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        toolCalls: [],
      });

    const generateText = createGenerateText({
      emailAccount: {
        email: "user@example.com",
        id: "email-account-1",
        userId: "user-1",
      },
      label: "Fallback Test",
      modelOptions,
    });

    const result = await generateText({
      prompt: "hello",
      model: primaryModel as SelectModel["model"],
    });

    expect(result.text).toBe("fallback success");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
    expect(mockGenerateText.mock.calls[0][0].model).toBe(primaryModel);
    expect(mockGenerateText.mock.calls[1][0].model).toBe(fallbackModel);
    expect(mockSaveAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openrouter",
        model: "fallback",
      }),
    );
  });

  it("reports the actual provider and model used for text generation", async () => {
    const model = { id: "openai-model" };
    const modelOptions: SelectModel = {
      provider: "openai",
      modelName: "gpt-5-mini",
      model: model as SelectModel["model"],
      providerOptions: undefined,
      fallbackModels: [],
      hasUserApiKey: false,
    };

    mockGenerateText.mockResolvedValue({
      text: "ok",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolCalls: [],
    });

    const onModelUsed = vi.fn();
    const generateText = createGenerateText({
      emailAccount: {
        email: "user@example.com",
        id: "email-account-1",
        userId: "user-1",
      },
      label: "Model attribution",
      modelOptions,
      onModelUsed,
    });

    await generateText({
      prompt: "hello",
      model: model as SelectModel["model"],
    });

    expect(onModelUsed).toHaveBeenCalledWith({
      provider: "openai",
      modelName: "gpt-5-mini",
    });
  });

  it("sets openrouter user from internal user id", async () => {
    const model = { id: "openrouter-model" };
    const modelOptions: SelectModel = {
      provider: "openrouter",
      modelName: "openrouter-primary",
      model: model as SelectModel["model"],
      providerOptions: {
        openrouter: {
          provider: {
            order: ["Anthropic"],
          },
        },
      },
      fallbackModels: [],
      hasUserApiKey: false,
    };

    mockGenerateText.mockResolvedValue({
      text: "ok",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolCalls: [],
    });

    const generateText = createGenerateText({
      emailAccount: {
        email: "user@example.com",
        id: "email-account-1",
        userId: "user-123",
      },
      label: "OpenRouter user metadata",
      modelOptions,
    });

    await generateText({
      prompt: "hello",
      model: model as SelectModel["model"],
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const providerOptions = mockGenerateText.mock.calls[0][0].providerOptions;
    expect(providerOptions.openrouter.user).toBe("user-123");
    expect(providerOptions.openrouter.provider).toEqual({
      order: ["Anthropic"],
    });
    expect(providerOptions.openrouter.trace.trace_name).toBe(
      "OpenRouter user metadata",
    );
    expect(providerOptions.openrouter.trace.generation_name).toBe(
      "OpenRouter user metadata",
    );
    expect(providerOptions.openrouter.trace.email_account_id).toBe(
      "email-account-1",
    );
  });

  it("keeps explicit openrouter user and trace when request provides them", async () => {
    const model = { id: "openrouter-model" };
    const modelOptions: SelectModel = {
      provider: "openrouter",
      modelName: "openrouter-primary",
      model: model as SelectModel["model"],
      providerOptions: undefined,
      fallbackModels: [],
      hasUserApiKey: false,
    };

    mockGenerateText.mockResolvedValue({
      text: "ok",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolCalls: [],
    });

    const generateText = createGenerateText({
      emailAccount: {
        email: "user@example.com",
        id: "email-account-1",
        userId: "internal-user-id",
      },
      label: "OpenRouter user override",
      modelOptions,
    });

    await generateText({
      prompt: "hello",
      model: model as SelectModel["model"],
      providerOptions: {
        openrouter: {
          user: "explicit-user-id",
          trace: {
            trace_name: "explicit-trace",
            generation_name: "explicit-generation",
            email_account_id: "explicit-email-account-id",
          },
        },
      },
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const providerOptions = mockGenerateText.mock.calls[0][0].providerOptions;
    expect(providerOptions.openrouter.user).toBe("explicit-user-id");
    expect(providerOptions.openrouter.trace).toEqual({
      trace_name: "explicit-trace",
      generation_name: "explicit-generation",
      email_account_id: "explicit-email-account-id",
    });
  });

  it("adds direct PostHog tracing with privacy mode", async () => {
    const model = { id: "openai-model" };
    const tracedModel = { id: "posthog-traced-model" };
    const modelOptions: SelectModel = {
      provider: "openai",
      modelName: "gpt-5-mini",
      model: model as SelectModel["model"],
      providerOptions: undefined,
      fallbackModels: [],
      hasUserApiKey: false,
    };

    mockWithTracing.mockReturnValue(tracedModel);
    mockGenerateText.mockResolvedValue({
      text: "ok",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolCalls: [],
    });

    const generateText = createGenerateText({
      emailAccount: {
        email: "user@example.com",
        id: "email-account-1",
        userId: "user-123",
      },
      label: "PostHog tracing",
      modelOptions,
    });

    await generateText({
      prompt: "sensitive prompt",
      model: model as SelectModel["model"],
    });

    expect(mockWithTracing).toHaveBeenCalledTimes(1);
    expect(mockWithTracing).toHaveBeenCalledWith(
      model,
      expect.any(Object),
      expect.objectContaining({
        posthogDistinctId: "user@example.com",
        posthogPrivacyMode: true,
      }),
    );

    const tracingOptions = mockWithTracing.mock.calls[0][2];
    expect(tracingOptions.posthogProperties).toEqual({
      label: "PostHog tracing",
      $ai_span_name: "PostHog tracing",
      provider: "openai",
      model: "gpt-5-mini",
      emailAccountId: "email-account-1",
      llmEvalsEnabled: false,
      userId: "user-123",
    });
    expect(tracingOptions.posthogProperties).not.toHaveProperty("prompt");
    expect(mockGenerateText.mock.calls[0][0].model).toBe(tracedModel);
  });

  it("disables privacy mode for approved local eval accounts", async () => {
    const model = { id: "openai-model" };
    const tracedModel = { id: "posthog-traced-model" };
    const modelOptions: SelectModel = {
      provider: "openai",
      modelName: "gpt-5-mini",
      model: model as SelectModel["model"],
      providerOptions: undefined,
      fallbackModels: [],
      hasUserApiKey: false,
    };

    mockIsPosthogLlmEvalApproved.mockReturnValue(true);
    mockWithTracing.mockReturnValue(tracedModel);
    mockGenerateText.mockResolvedValue({
      text: "ok",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolCalls: [],
    });

    const generateText = createGenerateText({
      emailAccount: {
        email: "user@example.com",
        id: "email-account-1",
        userId: "user-123",
      },
      label: "PostHog eval tracing",
      modelOptions,
    });

    await generateText({
      prompt: "sensitive prompt",
      model: model as SelectModel["model"],
    });

    expect(mockWithTracing).toHaveBeenCalledWith(
      model,
      expect.any(Object),
      expect.objectContaining({
        posthogDistinctId: "user@example.com",
        posthogPrivacyMode: false,
      }),
    );

    const tracingOptions = mockWithTracing.mock.calls[0][2];
    expect(tracingOptions.posthogProperties).toEqual({
      label: "PostHog eval tracing",
      $ai_span_name: "PostHog eval tracing",
      provider: "openai",
      model: "gpt-5-mini",
      emailAccountId: "email-account-1",
      llmEvalsEnabled: true,
      userId: "user-123",
    });
  });

  it("skips direct PostHog tracing when client is unavailable", async () => {
    const model = { id: "openai-model" };
    const modelOptions: SelectModel = {
      provider: "openai",
      modelName: "gpt-5-mini",
      model: model as SelectModel["model"],
      providerOptions: undefined,
      fallbackModels: [],
      hasUserApiKey: false,
    };

    mockGetPosthogLlmClient.mockReturnValue(undefined);
    mockGenerateText.mockResolvedValue({
      text: "ok",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolCalls: [],
    });

    const generateText = createGenerateText({
      emailAccount: {
        email: "user@example.com",
        id: "email-account-1",
        userId: "user-123",
      },
      label: "PostHog disabled",
      modelOptions,
    });

    await generateText({
      prompt: "hello",
      model: model as SelectModel["model"],
    });

    expect(mockWithTracing).not.toHaveBeenCalled();
    expect(mockGenerateText.mock.calls[0][0].model).toBe(model);
  });
});
