import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getEmailAccount } from "@/__tests__/helpers";

const envMock = vi.hoisted(() => ({
  DEFAULT_DECISION_MODEL: undefined as string | undefined,
  DEFAULT_DECISION_MODEL_ENABLED: false,
  TYPESAFE_API_KEY: undefined as string | undefined,
  OPENROUTER_API_KEY: undefined as string | undefined,
}));
const decideWithSystemOneMock = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@/utils/prisma");
vi.mock("@/utils/llms/model-usage-guard", () => ({
  assertTrialAiUsageAllowed: vi.fn(),
}));
vi.mock("@/utils/usage", () => ({ saveAiUsage: vi.fn() }));
vi.mock("@/utils/decision-model/system-one", () => ({
  decideWithSystemOne: decideWithSystemOneMock,
}));

import prisma from "@/utils/__mocks__/prisma";
import { saveAiUsage } from "@/utils/usage";
import {
  getDecisionModelConfig,
  runDecisionModel,
  runDecisionModelOrFallback,
} from "./decision-model";

const logger = createTestLogger();
const config = {
  provider: "typesafe" as const,
  model: "test-model",
  apiKey: "test-key",
};

describe("getDecisionModelConfig", () => {
  const deploymentConfig = {
    provider: "typesafe",
    model: "jev-latest",
    apiKey: "key",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.DEFAULT_DECISION_MODEL = "typesafe:jev-latest";
    envMock.DEFAULT_DECISION_MODEL_ENABLED = false;
    envMock.TYPESAFE_API_KEY = "key";
    envMock.OPENROUTER_API_KEY = undefined;
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

  it("returns null when the provider key is missing", async () => {
    envMock.TYPESAFE_API_KEY = undefined;
    mockUserSetting(true);

    expect(await getDecisionModelConfig(getEmailAccount())).toBeNull();
  });

  it("selects OpenRouter credentials without requiring a TypeSafe key", async () => {
    envMock.DEFAULT_DECISION_MODEL = "openrouter:typesafe/jev-1.13";
    envMock.TYPESAFE_API_KEY = undefined;
    envMock.OPENROUTER_API_KEY = "openrouter-key";
    mockUserSetting(true);

    expect(await getDecisionModelConfig(getEmailAccount())).toEqual({
      provider: "openrouter",
      model: "typesafe/jev-1.13",
      apiKey: "openrouter-key",
    });
  });

  it("does not use a TypeSafe key for an OpenRouter decision model", async () => {
    envMock.DEFAULT_DECISION_MODEL = "openrouter:typesafe/jev-1.13";
    mockUserSetting(true);

    expect(await getDecisionModelConfig(getEmailAccount())).toBeNull();
  });

  it("retains the direct TypeSafe key when both provider keys exist", async () => {
    envMock.OPENROUTER_API_KEY = "openrouter-key";
    mockUserSetting(true);

    expect(await getDecisionModelConfig(getEmailAccount())).toEqual(
      deploymentConfig,
    );
  });

  it("is opt-in when the deployment default is off", async () => {
    mockUserSetting(null);
    expect(await getDecisionModelConfig(getEmailAccount())).toBeNull();

    mockUserSetting(true);
    expect(await getDecisionModelConfig(getEmailAccount())).toEqual(
      deploymentConfig,
    );
  });

  it("is on unless the user opts out when the deployment default is on", async () => {
    envMock.DEFAULT_DECISION_MODEL_ENABLED = true;

    mockUserSetting(null);
    expect(await getDecisionModelConfig(getEmailAccount())).toEqual(
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
    expect(await getDecisionModelConfig(getEmailAccount())).toEqual(
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
        questions: {},
        label: "test",
        logger,
      }),
    ).rejects.toThrow("blocked by your account settings");
    expect(decideWithSystemOneMock).not.toHaveBeenCalled();
  });

  it("sends redacted state to the provider under a REDACT policy", async () => {
    const secret = "c".repeat(24);
    decideWithSystemOneMock.mockResolvedValue({
      model: "test-model",
      inputTokens: 1,
      outputTokens: 0,
      answers: {},
    });

    await runDecisionModel({
      config,
      emailAccount: { ...getEmailAccount(), sensitiveDataPolicy: "REDACT" },
      state: { content: `client_secret=${secret}` },
      questions: {},
      label: "test",
      logger,
    });

    const sent = JSON.stringify(decideWithSystemOneMock.mock.calls[0]?.[0]);
    expect(sent).not.toContain(secret);
  });

  it("records usage for the configured model", async () => {
    decideWithSystemOneMock.mockResolvedValue({
      model: "test-model",
      inputTokens: 1200,
      outputTokens: 12,
      answers: {},
    });

    await runDecisionModel({
      config,
      emailAccount: getEmailAccount(),
      state: {},
      questions: {},
      label: "test",
      logger,
    });

    expect(saveAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "typesafe",
        model: "test-model",
        label: "test",
        usage: expect.objectContaining({
          inputTokens: 1200,
          outputTokens: 12,
          totalTokens: 1212,
        }),
      }),
    );
  });

  it("records OpenRouter decision usage under OpenRouter rather than TypeSafe", async () => {
    decideWithSystemOneMock.mockResolvedValue({
      model: "typesafe/jev-1.13",
      inputTokens: 42,
      outputTokens: 0,
      answers: { applies: { type: "yesNo", probability: 0.8 } },
    });

    await runDecisionModel({
      config: {
        provider: "openrouter",
        model: "typesafe/jev-1.13",
        apiKey: "openrouter-key",
      },
      emailAccount: getEmailAccount(),
      state: {},
      questions: {},
      label: "test",
      logger,
    });

    expect(saveAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openrouter",
        model: "typesafe/jev-1.13",
        usage: expect.objectContaining({
          inputTokens: 42,
          outputTokens: 0,
          totalTokens: 42,
        }),
      }),
    );
  });
});

describe("runDecisionModelOrFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.DEFAULT_DECISION_MODEL = "typesafe:jev-latest";
    envMock.DEFAULT_DECISION_MODEL_ENABLED = false;
    envMock.TYPESAFE_API_KEY = "key";
    envMock.OPENROUTER_API_KEY = undefined;
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

  it("uses the normal LLM path without recording decision usage when OpenRouter fails", async () => {
    envMock.DEFAULT_DECISION_MODEL = "openrouter:typesafe/jev-1.13";
    envMock.TYPESAFE_API_KEY = undefined;
    envMock.OPENROUTER_API_KEY = "openrouter-key";
    prisma.user.findUnique.mockResolvedValue({
      decisionModelEnabled: true,
      aiApiKey: null,
    } as never);
    decideWithSystemOneMock.mockRejectedValue(
      new Error("OpenRouter request failed with status 429"),
    );
    const emailAccount = getEmailAccount();
    const fallback = vi.fn().mockResolvedValue("normal-llm-result");

    const result = await runDecisionModelOrFallback({
      emailAccount,
      logger,
      feature: "test",
      decide: (decisionConfig) =>
        runDecisionModel({
          config: decisionConfig,
          emailAccount,
          state: {},
          questions: {},
          label: "test",
          logger,
        }),
      fallback,
    });

    expect(result).toBe("normal-llm-result");
    expect(fallback).toHaveBeenCalledOnce();
    expect(saveAiUsage).not.toHaveBeenCalled();
  });
});
