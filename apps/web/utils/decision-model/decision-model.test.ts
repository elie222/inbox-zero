import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getEmailAccount } from "@/__tests__/helpers";

const envMock = vi.hoisted(() => ({
  DEFAULT_DECISION_MODEL: undefined as string | undefined,
  DEFAULT_DECISION_MODEL_ENABLED: false,
  TYPESAFE_API_KEY: undefined as string | undefined,
  OPENROUTER_API_KEY: undefined as string | undefined,
  LLM_API_KEY: undefined as string | undefined,
}));

vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@/utils/prisma");
vi.mock("@/utils/llms/model-usage-guard", () => ({
  assertTrialAiUsageAllowed: vi.fn(),
}));
vi.mock("@/utils/usage", () => ({ saveAiUsage: vi.fn() }));

import { Experimental_DecisionMockModelV4 } from "ai/test";
import prisma from "@/utils/__mocks__/prisma";
import { saveAiUsage } from "@/utils/usage";
import {
  getDecisionModelConfig,
  runDecisionModel,
  runDecisionModelOrFallback,
} from "./decision-model";

const logger = createTestLogger();
const doDecide = vi.fn();
const config = {
  provider: "typesafe" as const,
  modelId: "test-model",
  model: new Experimental_DecisionMockModelV4({ doDecide }),
};
const appliesQuestion = {
  applies: { type: "boolean", instructions: "Does it apply?" },
} as const;

describe("getDecisionModelConfig", () => {
  const deploymentConfig = { provider: "typesafe", modelId: "jev-latest" };

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.DEFAULT_DECISION_MODEL = "typesafe:jev-latest";
    envMock.DEFAULT_DECISION_MODEL_ENABLED = false;
    envMock.TYPESAFE_API_KEY = "key";
    envMock.OPENROUTER_API_KEY = undefined;
    envMock.LLM_API_KEY = undefined;
  });

  function mockUserSetting(
    decisionModelEnabled: boolean | null,
    aiApiKey: string | null = null,
  ) {
    prisma.user.findUnique.mockResolvedValue({
      decisionModelEnabled,
      aiApiKey,
    } as never);
  }

  it("returns null without a database lookup when no decision model is configured", async () => {
    envMock.DEFAULT_DECISION_MODEL = undefined;

    expect(await getDecisionModelConfig(getEmailAccount())).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when the TypeSafe key is missing, even with LLM_API_KEY", async () => {
    envMock.TYPESAFE_API_KEY = undefined;
    envMock.LLM_API_KEY = "shared-key";
    mockUserSetting(true);

    expect(await getDecisionModelConfig(getEmailAccount())).toBeNull();
  });

  it("resolves OpenRouter decision models with the OpenRouter key", async () => {
    envMock.DEFAULT_DECISION_MODEL = "openrouter:cloudflare/clef";
    envMock.OPENROUTER_API_KEY = "openrouter-key";
    mockUserSetting(true);

    const config = await getDecisionModelConfig(getEmailAccount());

    expect(config).toMatchObject({
      provider: "openrouter",
      modelId: "cloudflare/clef",
      model: { provider: "openrouter", modelId: "cloudflare/clef" },
    });
  });

  it("falls back to LLM_API_KEY when the provider key is unset or blank", async () => {
    envMock.DEFAULT_DECISION_MODEL = "openrouter:cloudflare/clef";
    envMock.OPENROUTER_API_KEY = "  ";
    mockUserSetting(true);
    expect(await getDecisionModelConfig(getEmailAccount())).toBeNull();

    envMock.LLM_API_KEY = "shared-key";

    expect(await getDecisionModelConfig(getEmailAccount())).toMatchObject({
      provider: "openrouter",
      modelId: "cloudflare/clef",
    });
  });

  it("is opt-in when the deployment default is off", async () => {
    mockUserSetting(null);
    expect(await getDecisionModelConfig(getEmailAccount())).toBeNull();

    mockUserSetting(true);
    expect(await getDecisionModelConfig(getEmailAccount())).toMatchObject(
      deploymentConfig,
    );
  });

  it("is on unless the user opts out when the deployment default is on", async () => {
    envMock.DEFAULT_DECISION_MODEL_ENABLED = true;

    mockUserSetting(null);
    expect(await getDecisionModelConfig(getEmailAccount())).toMatchObject(
      deploymentConfig,
    );

    mockUserSetting(false);
    expect(await getDecisionModelConfig(getEmailAccount())).toBeNull();
  });

  it("does not enroll users with their own AI key through the deployment default", async () => {
    envMock.DEFAULT_DECISION_MODEL_ENABLED = true;

    mockUserSetting(null, "user-key");
    expect(await getDecisionModelConfig(getEmailAccount())).toBeNull();

    mockUserSetting(true, "user-key");
    expect(await getDecisionModelConfig(getEmailAccount())).toMatchObject(
      deploymentConfig,
    );
  });
});

describe("runDecisionModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call the provider when the sensitive data policy blocks the request", async () => {
    await expect(
      runDecisionModel({
        config,
        emailAccount: { ...getEmailAccount(), sensitiveDataPolicy: "BLOCK" },
        state: { content: `client_secret=${"c".repeat(24)}` },
        questions: appliesQuestion,
        label: "test",
        logger,
      }),
    ).rejects.toThrow("blocked by your account settings");
    expect(doDecide).not.toHaveBeenCalled();
  });

  it("sends redacted state to the provider under a REDACT policy", async () => {
    const secret = "c".repeat(24);
    doDecide.mockResolvedValue(
      decisionResult({ applies: { type: "boolean", probability: 0.5 } }),
    );

    await runDecisionModel({
      config,
      emailAccount: { ...getEmailAccount(), sensitiveDataPolicy: "REDACT" },
      state: { content: `client_secret=${secret}` },
      questions: appliesQuestion,
      label: "test",
      logger,
    });

    const sent = JSON.stringify(doDecide.mock.calls[0]?.[0].state);
    expect(sent).not.toContain(secret);
  });

  it("sends state with undefined fields, such as a missing header", async () => {
    doDecide.mockResolvedValue(
      decisionResult({ applies: { type: "boolean", probability: 0.5 } }),
    );

    await runDecisionModel({
      config,
      emailAccount: getEmailAccount(),
      state: { email: { subject: "Hi", to: undefined } },
      questions: appliesQuestion,
      label: "test",
      logger,
    });

    expect(doDecide.mock.calls[0]?.[0].state).toEqual({
      email: { subject: "Hi" },
    });
  });

  it("records usage and provider-reported cost for the configured model", async () => {
    doDecide.mockResolvedValue({
      ...decisionResult({ applies: { type: "boolean", probability: 0.5 } }),
      usage: { inputTokens: 1200, outputTokens: 12 },
      providerMetadata: { typesafe: { usage: { cost: 0.0003 } } },
    });

    await runDecisionModel({
      config,
      emailAccount: getEmailAccount(),
      state: {},
      questions: appliesQuestion,
      label: "test",
      logger,
    });

    expect(saveAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "typesafe",
        model: "test-model",
        label: "test",
        providerReportedCost: 0.0003,
        usage: expect.objectContaining({
          inputTokens: 1200,
          outputTokens: 12,
          totalTokens: 1212,
        }),
      }),
    );
  });

  it("uses provider-reported choice confidence, else the chosen probability", async () => {
    doDecide.mockResolvedValue({
      ...decisionResult({
        reported: {
          type: "choice",
          choice: "a",
          probabilities: { a: 0.9, b: 0.1 },
        },
        derived: {
          type: "choice",
          choice: "b",
          probabilities: { a: 0.2, b: 0.8 },
        },
      }),
      providerMetadata: { typesafe: { confidence: { reported: 0.6 } } },
    });

    const choice = {
      type: "choice",
      instructions: "Pick one",
      criteria: { a: "A", b: "B" },
    } as const;
    const response = await runDecisionModel({
      config,
      emailAccount: getEmailAccount(),
      state: {},
      questions: { reported: choice, derived: choice },
      label: "test",
      logger,
    });

    expect(response.answers.reported).toMatchObject({ confidence: 0.6 });
    expect(response.answers.derived).toMatchObject({ confidence: 0.8 });
  });
});

describe("runDecisionModelOrFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.DEFAULT_DECISION_MODEL = "typesafe:jev-latest";
    envMock.DEFAULT_DECISION_MODEL_ENABLED = false;
    envMock.TYPESAFE_API_KEY = "key";
  });

  it("keeps the original path when the decision model is not enabled", async () => {
    prisma.user.findUnique.mockResolvedValue({
      decisionModelEnabled: false,
      aiApiKey: null,
    } as never);
    const decide = vi.fn();
    const fallback = vi.fn().mockResolvedValue("llm");

    const result = await runDecisionModelOrFallback({
      emailAccount: getEmailAccount(),
      logger,
      feature: "test",
      decide,
      fallback,
    });

    expect(result).toBe("llm");
    expect(decide).not.toHaveBeenCalled();
  });

  it("falls back when the enabled decision model fails", async () => {
    prisma.user.findUnique.mockResolvedValue({
      decisionModelEnabled: true,
      aiApiKey: null,
    } as never);
    const decide = vi.fn().mockRejectedValue(new Error("provider down"));
    const fallback = vi.fn().mockResolvedValue("llm");

    const result = await runDecisionModelOrFallback({
      emailAccount: getEmailAccount(),
      logger,
      feature: "test",
      decide,
      fallback,
    });

    expect(result).toBe("llm");
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("falls back when decision-model configuration lookup fails", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("database unavailable"));
    const decide = vi.fn();
    const fallback = vi.fn().mockResolvedValue("llm");

    const result = await runDecisionModelOrFallback({
      emailAccount: getEmailAccount(),
      logger,
      feature: "test",
      decide,
      fallback,
    });

    expect(result).toBe("llm");
    expect(decide).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
  });
});

function decisionResult(answers: Record<string, unknown>) {
  return { answers, warnings: [] };
}
