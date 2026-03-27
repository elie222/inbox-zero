import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockGenerateObject, mockSaveAiUsage, mockShouldForceNanoModel } =
  vi.hoisted(() => ({
    mockGenerateObject: vi.fn(),
    mockSaveAiUsage: vi.fn(),
    mockShouldForceNanoModel: vi.fn(),
  }));

vi.mock("ai", () => ({
  APICallError: { isInstance: () => false },
  RetryError: { isInstance: () => false },
  NoObjectGeneratedError: { isInstance: () => false },
  TypeValidationError: { isInstance: () => false },
  ToolLoopAgent: class {},
  generateObject: mockGenerateObject,
  generateText: vi.fn(),
  streamText: vi.fn(),
  smoothStream: vi.fn(),
  stepCountIs: vi.fn(),
}));

vi.mock("@posthog/ai/vercel", () => ({
  withTracing: vi.fn((model) => model),
}));

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    NANO_LLM_PROVIDER: "",
    NANO_LLM_MODEL: "",
    NEXT_PUBLIC_POSTHOG_KEY: "",
  },
}));

vi.mock("@/utils/usage", () => ({
  saveAiUsage: mockSaveAiUsage,
}));

vi.mock("@/utils/error-messages", () => ({
  addUserErrorMessageWithNotification: vi.fn(),
  ErrorType: {},
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
  isAnthropicInsufficientBalanceError: vi.fn(() => false),
  isIncorrectOpenAIAPIKeyError: vi.fn(() => false),
  isInsufficientCreditsError: vi.fn(() => false),
  isInvalidAIModelError: vi.fn(() => false),
  isOpenAIAPIKeyDeactivatedError: vi.fn(() => false),
  isAiQuotaExceededError: vi.fn(() => false),
  markAsHandledUserKeyError: vi.fn(),
  SafeError: class SafeError extends Error {},
}));

vi.mock("@/utils/llms/model-usage-guard", () => ({
  shouldForceNanoModel: mockShouldForceNanoModel,
}));

vi.mock("@/utils/posthog", () => ({
  getPosthogLlmClient: vi.fn(() => undefined),
  isPosthogLlmEvalApproved: vi.fn(() => false),
}));

async function createTestGenerateObject() {
  const { createGenerateObject } = await import("./index");

  return createGenerateObject({
    emailAccount: {
      id: "account-1",
      email: "user@example.com",
      userId: "user-1",
    },
    label: "test",
    modelOptions: {
      provider: "openai",
      modelName: "gpt-test",
      model: {} as any,
      providerOptions: undefined,
      hasUserApiKey: false,
      fallbackModels: [],
    } as any,
  });
}

async function getRepairText() {
  const generateObject = await createTestGenerateObject();

  await generateObject({
    system: "Return JSON.",
    prompt: "Return JSON.",
    schema: {} as any,
  } as any);

  return mockGenerateObject.mock.calls[0][0].experimental_repairText;
}

describe("createGenerateObject repairText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldForceNanoModel.mockResolvedValue({ shouldForce: false });
    mockGenerateObject.mockResolvedValue({
      object: { ok: true },
      usage: null,
    });
    mockSaveAiUsage.mockResolvedValue(undefined);
  });

  it("unwraps JSON wrapped in single quotes before repairing", async () => {
    const repairText = await getRepairText();
    const repaired = await repairText({ text: `'{"category":"updates",}'` });

    expect(JSON.parse(repaired)).toEqual({ category: "updates" });
  });

  it("returns the original text when repair cannot fix it", async () => {
    const repairText = await getRepairText();
    const originalText = "'not json";

    await expect(repairText({ text: originalText })).resolves.toBe(
      originalText,
    );
  });

  it("does not reject when the repair hook receives irreparable text", async () => {
    mockGenerateObject.mockImplementationOnce(async (options) => {
      await options.experimental_repairText({ text: "'not json" });

      return {
        object: { ok: true },
        usage: null,
      };
    });

    const generateObject = await createTestGenerateObject();

    await expect(
      generateObject({
        system: "Return JSON.",
        prompt: "Return JSON.",
        schema: {} as any,
      } as any),
    ).resolves.toEqual({
      object: { ok: true },
      usage: null,
    });
  });
});
