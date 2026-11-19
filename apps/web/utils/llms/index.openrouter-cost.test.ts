import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmUseCase } from "@/utils/llms/use-cases";
import { createGenerateText, toolCallAgentStream } from "./index";

const { mockGetModelForUseCase, mockSaveAiUsage } = vi.hoisted(() => ({
  mockGetModelForUseCase: vi.fn(),
  mockSaveAiUsage: vi.fn(),
}));

vi.mock("@/utils/llms/use-cases", async (importActual) => ({
  ...(await importActual<typeof import("@/utils/llms/use-cases")>()),
  getModelForUseCase: mockGetModelForUseCase,
}));

vi.mock("@/utils/llms/model-usage-guard", () => ({
  assertTrialAiUsageAllowed: vi.fn(),
  shouldForceNanoModel: vi.fn().mockResolvedValue({ shouldForce: false }),
}));

vi.mock("@/utils/usage", () => ({ saveAiUsage: mockSaveAiUsage }));

vi.mock("@/utils/posthog", () => ({
  getPosthogLlmClient: vi.fn(() => undefined),
  isPosthogLlmEvalApproved: vi.fn(() => false),
}));

const MODEL_NAME = "anthropic/claude-haiku-5.5";

// Recorded from OpenRouter for a BYOK request: `cost` is OpenRouter's own fee
// (0 here) and the real spend is only in `cost_details`.
const recordedUsage = {
  prompt_tokens: 16,
  completion_tokens: 5,
  total_tokens: 21,
  cost: 0,
  is_byok: true,
  prompt_tokens_details: { cached_tokens: 0 },
  completion_tokens_details: { reasoning_tokens: 0 },
  cost_details: { upstream_inference_cost: 0.000_004_1 },
};

describe("OpenRouter provider cost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveAiUsage.mockResolvedValue(undefined);
  });

  it("records upstream cost from a non-streaming response", async () => {
    const generateText = createGenerateText({
      emailAccount: {
        email: "user@example.com",
        id: "email-account-1",
        userId: "user-1",
      },
      label: "test",
      modelOptions: createModelOptions(createJsonFetch()),
      promptHardening: { trust: "trusted" },
    });

    await generateText({ prompt: "Say hi in one word." });

    expect(mockSaveAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODEL_NAME,
        providerReportedCost: 0,
        providerUpstreamInferenceCost: 0.000_004_1,
        providerCostSource: "openrouter_step_usage_sum",
      }),
    );
  });

  it("records upstream cost from a streaming response", async () => {
    mockGetModelForUseCase.mockReturnValue(
      createModelOptions(createStreamFetch()),
    );

    const result = await toolCallAgentStream({
      userAi: { aiProvider: null, aiModel: null, aiApiKey: null },
      userEmail: "user@example.com",
      emailAccountId: "email-account-1",
      useCase: LlmUseCase.AssistantChat,
      usageLabel: "test",
      promptHardening: { trust: "trusted" },
      messages: [{ role: "user", content: "Say hi in one word." }],
      tools: {},
    });
    await result.consumeStream();
    await vi.waitFor(() => expect(mockSaveAiUsage).toHaveBeenCalled());

    expect(mockSaveAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODEL_NAME,
        providerReportedCost: 0,
        providerUpstreamInferenceCost: 0.000_004_1,
        providerCostSource: "openrouter_step_usage_sum",
      }),
    );
  });
});

function createModelOptions(fetch: typeof globalThis.fetch) {
  return {
    provider: "openrouter",
    modelName: MODEL_NAME,
    model: createOpenRouter({ apiKey: "test-key", fetch })(MODEL_NAME),
    fallbackModels: [],
    hasUserApiKey: false,
  };
}

function createJsonFetch(): typeof globalThis.fetch {
  return async () =>
    Response.json({
      id: "gen-1",
      provider: "Anthropic",
      model: MODEL_NAME,
      object: "chat.completion",
      created: 1,
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: "Hi" },
        },
      ],
      usage: recordedUsage,
    });
}

function createStreamFetch(): typeof globalThis.fetch {
  const chunk = (body: Record<string, unknown>) =>
    `data: ${JSON.stringify({
      id: "gen-1",
      provider: "Anthropic",
      model: MODEL_NAME,
      object: "chat.completion.chunk",
      created: 1,
      ...body,
    })}\n\n`;

  const body = [
    chunk({
      choices: [{ index: 0, delta: { role: "assistant", content: "Hi" } }],
    }),
    chunk({
      choices: [{ index: 0, delta: { content: "" }, finish_reason: "stop" }],
    }),
    chunk({ choices: [], usage: recordedUsage }),
    "data: [DONE]\n\n",
  ].join("");

  return async () =>
    new Response(body, {
      headers: { "content-type": "text/event-stream" },
    });
}
