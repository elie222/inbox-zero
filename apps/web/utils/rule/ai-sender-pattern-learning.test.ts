import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isJevModelName,
  shouldLearnAiSenderPatterns,
} from "./ai-sender-pattern-learning";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    learningEnabled: true as boolean | undefined,
    defaultLlms: "openai:gpt-5.4-mini",
    economyLlms: undefined as string | undefined,
    nanoLlms: undefined as string | undefined,
    chatLlms: undefined as string | undefined,
    draftLlms: undefined as string | undefined,
  },
}));

vi.mock("@/env", () => ({
  env: {
    get AI_SENDER_PATTERN_LEARNING_ENABLED() {
      return mockEnv.learningEnabled;
    },
    get DEFAULT_LLMS() {
      return mockEnv.defaultLlms;
    },
    get ECONOMY_LLMS() {
      return mockEnv.economyLlms;
    },
    get NANO_LLMS() {
      return mockEnv.nanoLlms;
    },
    get CHAT_LLMS() {
      return mockEnv.chatLlms;
    },
    get DRAFT_LLMS() {
      return mockEnv.draftLlms;
    },
  },
}));

describe("shouldLearnAiSenderPatterns", () => {
  beforeEach(() => {
    mockEnv.learningEnabled = true;
    mockEnv.defaultLlms = "openai:gpt-5.4-mini";
    mockEnv.economyLlms = undefined;
    mockEnv.nanoLlms = undefined;
    mockEnv.chatLlms = undefined;
    mockEnv.draftLlms = undefined;
  });

  it("learns by default so existing deployments stay unchanged", () => {
    expect(shouldLearnAiSenderPatterns()).toBe(true);
  });

  it("learns when the env flag is unset", () => {
    mockEnv.learningEnabled = undefined;
    expect(shouldLearnAiSenderPatterns()).toBe(true);
  });

  it("does not learn when the env flag is off", () => {
    mockEnv.learningEnabled = false;
    expect(
      shouldLearnAiSenderPatterns({
        user: { aiProvider: "openai", aiModel: "gpt-5.4-mini" },
      }),
    ).toBe(false);
  });

  it("does not learn when the deployment default model is Jev", () => {
    mockEnv.defaultLlms = "openrouter:typesafe/jev-latest";
    expect(shouldLearnAiSenderPatterns()).toBe(false);
  });

  it("does not learn when this account's model is Jev", () => {
    expect(
      shouldLearnAiSenderPatterns({
        user: { aiProvider: "openrouter", aiModel: "typesafe/jev-1.13" },
      }),
    ).toBe(false);
  });

  it("still learns for an account that is not on Jev", () => {
    mockEnv.defaultLlms = "openrouter:typesafe/jev-latest";
    expect(
      shouldLearnAiSenderPatterns({
        user: { aiProvider: "openai", aiModel: "gpt-5.4-mini" },
      }),
    ).toBe(true);
  });

  it("does not learn economy runs when the economy model is Jev", () => {
    mockEnv.economyLlms = "aigateway:typesafe-ai/jev";
    expect(shouldLearnAiSenderPatterns({ modelType: "economy" })).toBe(false);
    expect(shouldLearnAiSenderPatterns({ modelType: "default" })).toBe(true);
  });

  it("does not treat unrelated model names as Jev", () => {
    mockEnv.defaultLlms =
      "openai:gpt-5.4-mini,openrouter:google/gemini-2.5-flash";
    expect(shouldLearnAiSenderPatterns()).toBe(true);
  });
});

describe("isJevModelName", () => {
  it.each([
    "jev",
    "typesafe/jev",
    "typesafe/jev-latest",
    "typesafe/jev-1.13",
    "openrouter:typesafe/jev-latest",
    "~typesafe/jev-latest",
    "aigateway:typesafe-ai/jev",
  ])("detects %s", (value) => {
    expect(isJevModelName(value)).toBe(true);
  });

  it.each([
    "openai:gpt-5.4-mini",
    "google/gemini-2.5-flash",
    "jevon",
    "myjevmodel",
    "",
    null,
    undefined,
  ])("does not detect %s", (value) => {
    expect(isJevModelName(value)).toBe(false);
  });
});
