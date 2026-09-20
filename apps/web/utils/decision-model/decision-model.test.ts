import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getEmailAccount } from "@/__tests__/helpers";

const envMock = vi.hoisted(() => ({
  DEFAULT_DECISION_MODEL: undefined as string | undefined,
  DEFAULT_DECISION_MODEL_ENABLED: false,
  TYPESAFE_API_KEY: undefined as string | undefined,
}));
const decideWithTypeSafeMock = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@/utils/prisma");
vi.mock("@/utils/llms/model-usage-guard", () => ({
  assertTrialAiUsageAllowed: vi.fn(),
}));
vi.mock("@/utils/usage", () => ({ saveAiUsage: vi.fn() }));
vi.mock("@/utils/decision-model/typesafe", () => ({
  decideWithTypeSafe: decideWithTypeSafeMock,
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
    expect(decideWithTypeSafeMock).not.toHaveBeenCalled();
  });

  it("sends redacted state to the provider under a REDACT policy", async () => {
    const secret = "c".repeat(24);
    decideWithTypeSafeMock.mockResolvedValue({
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

    const sent = JSON.stringify(decideWithTypeSafeMock.mock.calls[0]?.[0]);
    expect(sent).not.toContain(secret);
  });

  it("records usage for the configured model", async () => {
    decideWithTypeSafeMock.mockResolvedValue({
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
});
