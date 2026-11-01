import { APICallError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureException } from "@/utils/error";

const {
  mockAddUserErrorMessageWithNotification,
  mockGenerateText,
  mockSentryCaptureException,
} = vi.hoisted(() => ({
  mockAddUserErrorMessageWithNotification: vi.fn(),
  mockGenerateText: vi.fn(),
  mockSentryCaptureException: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mockGenerateText,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mockSentryCaptureException,
  setUser: vi.fn(),
}));

vi.mock("@posthog/ai", () => ({
  captureAiGeneration: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    NANO_LLMS: "",
    NEXT_PUBLIC_POSTHOG_KEY: "",
    EMAIL_ENCRYPT_SALT: "test-salt",
  },
}));

vi.mock("@/utils/usage", () => ({
  saveAiUsage: vi.fn(),
}));

vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/error-messages", () => ({
  addUserErrorMessageWithNotification: mockAddUserErrorMessageWithNotification,
  ErrorType: {
    INCORRECT_API_KEY: "INCORRECT_API_KEY",
    INVALID_AI_MODEL: "INVALID_AI_MODEL",
    API_KEY_DEACTIVATED: "API_KEY_DEACTIVATED",
    INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
    AI_QUOTA_ERROR: "AI_QUOTA_ERROR",
  },
}));

vi.mock("@/utils/llms/model-usage-guard", () => ({
  assertTrialAiUsageAllowed: vi.fn(),
  shouldForceNanoModel: vi.fn().mockResolvedValue({ shouldForce: false }),
}));

vi.mock("@/utils/posthog", () => ({
  getPosthogLlmClient: vi.fn(() => undefined),
  isPosthogLlmEvalApproved: vi.fn(() => false),
}));

describe("LLM call errors from misconfigured AI providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each([
    ["a model the provider no longer serves", createRetiredModelError],
    ["a Gemini project over its spending cap", createSpendingCapError],
  ])("%s", (_caseName, createError) => {
    it("notifies the user and stays out of Sentry on the user's own key", async () => {
      const error = await getGenerateTextFailure({
        hasUserApiKey: true,
        error: createError(),
      });

      captureException(error);

      expect(mockAddUserErrorMessageWithNotification).toHaveBeenCalledTimes(1);
      expect(mockSentryCaptureException).not.toHaveBeenCalled();
    });

    it("reaches Sentry without blaming the user on our key", async () => {
      const error = await getGenerateTextFailure({
        hasUserApiKey: false,
        error: createError(),
      });

      captureException(error);

      expect(mockAddUserErrorMessageWithNotification).not.toHaveBeenCalled();
      expect(mockSentryCaptureException).toHaveBeenCalledWith(
        error,
        expect.anything(),
      );
    });
  });
});

async function getGenerateTextFailure({
  hasUserApiKey,
  error,
}: {
  hasUserApiKey: boolean;
  error: APICallError;
}) {
  mockGenerateText.mockRejectedValue(error);
  const { createGenerateText } = await import("./index");

  const generateText = createGenerateText({
    emailAccount: {
      id: "account-1",
      email: "user@example.com",
      userId: "user-1",
    },
    label: "test",
    modelOptions: {
      provider: "openrouter",
      modelName: "vendor/retired-alpha",
      model: {} as any,
      hasUserApiKey,
      fallbackModels: [],
    } as any,
    promptHardening: { trust: "untrusted", level: "full" },
  });

  return generateText({ prompt: "Hello" } as any).then(
    () => {
      throw new Error("Expected the LLM call to fail");
    },
    (thrown: unknown) => thrown,
  );
}

function createRetiredModelError() {
  const message =
    "vendor/retired-alpha is no longer available on OpenRouter: no provider serves this model anymore.";
  return new APICallError({
    message,
    url: "https://openrouter.ai/api/v1/chat/completions",
    requestBodyValues: {},
    statusCode: 404,
    responseBody: JSON.stringify({ error: { code: 404, message } }),
    isRetryable: false,
  });
}

function createSpendingCapError() {
  const message =
    "Your project has exceeded its monthly spending cap. Please go to AI Studio to manage your project spend cap.";
  return new APICallError({
    message,
    url: "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
    requestBodyValues: {},
    statusCode: 429,
    responseBody: JSON.stringify({
      error: { code: 429, message, status: "RESOURCE_EXHAUSTED" },
    }),
    isRetryable: true,
  });
}
