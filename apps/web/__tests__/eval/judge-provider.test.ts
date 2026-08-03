import { afterEach, describe, expect, it, vi } from "vitest";
import { getEvalJudgeUserAi } from "@/__tests__/eval/judge-provider";

describe("getEvalJudgeUserAi", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the latest DeepSeek V4 Flash version through OpenRouter by default", () => {
    vi.stubEnv("EVAL_JUDGE_PROVIDER", "");
    vi.stubEnv("EVAL_JUDGE_MODEL", "");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");

    expect(getEvalJudgeUserAi()).toEqual({
      aiProvider: "openrouter",
      aiModel: "~deepseek/deepseek-v4-flash-latest",
      aiApiKey: "test-key",
    });
  });

  it("allows the judge provider and model to be overridden", () => {
    vi.stubEnv("EVAL_JUDGE_PROVIDER", "google");
    vi.stubEnv("EVAL_JUDGE_MODEL", "google/test-model");
    vi.stubEnv("GOOGLE_API_KEY", "test-key");

    expect(getEvalJudgeUserAi()).toEqual({
      aiProvider: "google",
      aiModel: "google/test-model",
      aiApiKey: "test-key",
    });
  });
});
