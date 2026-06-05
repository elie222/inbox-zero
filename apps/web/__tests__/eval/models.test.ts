import { afterEach, describe, expect, it } from "vitest";
import { getEvalModels, shouldRunEvalTests } from "@/__tests__/eval/models";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("shouldRunEvalTests", () => {
  it("exposes Azure DeepSeek presets without including them in all-model runs", () => {
    process.env.EVAL_MODELS = "deepseek-v4-pro-azure";

    expect(getEvalModels()).toEqual([
      {
        provider: "azure-foundry",
        model: "DeepSeek-V4-Pro",
        label: "DeepSeek V4 Pro Azure",
        includeInAll: false,
      },
    ]);

    process.env.EVAL_MODELS = "deepseek-v4-flash-azure";

    expect(getEvalModels()).toEqual([
      {
        provider: "azure-foundry",
        model: "DeepSeek-V4-Flash",
        label: "DeepSeek V4 Flash Azure",
        includeInAll: false,
      },
    ]);

    process.env.EVAL_MODELS = "all";

    expect(
      getEvalModels().some((model) => model.model.startsWith("DeepSeek-V4-")),
    ).toBe(false);
  });

  it("allows openrouter eval presets when only LLM_API_KEY is configured", () => {
    process.env.RUN_AI_TESTS = "true";
    process.env.EVAL_MODELS = "gemini-3-flash";
    process.env.OPENROUTER_API_KEY = undefined;
    process.env.LLM_API_KEY = "shared-key";

    expect(shouldRunEvalTests()).toBe(true);
  });

  it("does not treat unrelated provider keys as valid for openrouter eval presets", () => {
    process.env.RUN_AI_TESTS = "true";
    process.env.EVAL_MODELS = "gemini-3-flash";
    process.env.OPENROUTER_API_KEY = undefined;
    process.env.LLM_API_KEY = undefined;
    process.env.OPENAI_API_KEY = "openai-key";

    expect(shouldRunEvalTests()).toBe(false);
  });

  it("uses the default provider when no eval matrix is specified", () => {
    process.env.RUN_AI_TESTS = "true";
    process.env.EVAL_MODELS = undefined;
    process.env.DEFAULT_LLMS = "openai:gpt-5.4-mini";
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.LLM_API_KEY = undefined;

    expect(shouldRunEvalTests()).toBe(true);
  });
});
