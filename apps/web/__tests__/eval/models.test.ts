import { afterEach, describe, expect, it } from "vitest";
import {
  EVAL_MODEL_CATALOG,
  getEmailAccountForModel,
  getEvalModels,
} from "@/__tests__/eval/model-catalog";
import { shouldRunEvalTests } from "@/__tests__/eval/models";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("shouldRunEvalTests", () => {
  it("keeps the Azure Luna preset out of all-model runs", () => {
    process.env.EVAL_MODELS = "gpt-5.6-luna-azure";

    expect(getEvalModels()).toEqual([
      {
        provider: "azure-foundry",
        model: "gpt-5.6-luna",
        label: "GPT-5.6 Luna Azure",
        includeInAll: false,
      },
    ]);

    process.env.EVAL_MODELS = "all";

    expect(getEvalModels()).toEqual([
      expect.objectContaining({ model: "openai/gpt-6-luna" }),
      expect.objectContaining({ model: "anthropic/claude-haiku-5.5" }),
    ]);
  });

  it("rejects unknown shorthands instead of falling back to the default model", () => {
    process.env.EVAL_MODELS = "gpt-6-luna,gemini-3.8-flash";

    expect(() => getEvalModels()).toThrow(/gemini-3\.8-flash/);
  });

  it("allows openrouter eval presets when only LLM_API_KEY is configured", () => {
    process.env.RUN_AI_TESTS = "true";
    process.env.EVAL_MODELS = "gpt-6-luna";
    process.env.OPENROUTER_API_KEY = undefined;
    process.env.LLM_API_KEY = "shared-key";

    expect(shouldRunEvalTests()).toBe(true);
  });

  it("uses LLM_API_KEY for the selected openrouter eval model", () => {
    process.env.OPENROUTER_API_KEY = undefined;
    process.env.LLM_API_KEY = "shared-key";

    const emailAccount = getEmailAccountForModel(
      EVAL_MODEL_CATALOG["claude-haiku-5.5"],
    );

    expect(emailAccount.user).toEqual({
      aiProvider: "openrouter",
      aiModel: "anthropic/claude-haiku-5.5",
      aiApiKey: "shared-key",
    });
  });

  it("does not treat unrelated provider keys as valid for openrouter eval presets", () => {
    process.env.RUN_AI_TESTS = "true";
    process.env.EVAL_MODELS = "gpt-6-luna";
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
