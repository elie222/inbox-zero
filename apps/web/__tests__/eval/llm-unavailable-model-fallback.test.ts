import { afterAll, describe, expect, test } from "vitest";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { createGenerateText } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";

// Run with:
// pnpm --filter inbox-zero-ai test-ai eval/llm-unavailable-model-fallback.test.ts

const PRIMARY_MODEL = "qa/definitely-unavailable-model-3110";
const FALLBACK_MODEL = "google/gemini-3.1-flash-lite-preview";
const TIMEOUT = 30_000;
const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)("Eval: unavailable LLM model fallback", () => {
  const evalReporter = createEvalReporter({
    evalName: "llm-unavailable-model-fallback",
  });

  test(
    "uses Gemini 3.1 Flash Lite after the configured primary is unavailable",
    async () => {
      const apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY;
      if (!apiKey) {
        throw new Error("OpenRouter credentials are required for this eval");
      }

      const primaryModel = getModel({
        aiProvider: "openrouter",
        aiModel: PRIMARY_MODEL,
        aiApiKey: apiKey,
      });
      const fallbackModel = getModel({
        aiProvider: "openrouter",
        aiModel: FALLBACK_MODEL,
        aiApiKey: apiKey,
      });
      const modelOptions = {
        ...primaryModel,
        fallbackModels: [
          {
            provider: fallbackModel.provider,
            modelName: fallbackModel.modelName,
            model: fallbackModel.model,
            providerOptions: fallbackModel.providerOptions,
          },
        ],
      };
      let modelUsed: { provider: string; modelName: string } | undefined;
      const generateText = createGenerateText({
        emailAccount: {
          email: "qa-fallback@example.com",
          id: "",
          userId: "",
        },
        label: "qa-unavailable-model-fallback",
        modelOptions,
        promptHardening: { trust: "trusted" },
        onModelUsed: (model) => {
          modelUsed = model;
        },
      });

      const result = await generateText({
        model: modelOptions.model,
        prompt: "Reply with the exact text FALLBACK_OK and nothing else.",
      });

      const expectedModel = {
        provider: "openrouter",
        modelName: FALLBACK_MODEL,
      };
      const pass = modelUsed?.modelName === expectedModel.modelName;

      evalReporter.record({
        testName: "configured unavailable model uses fallback",
        model: "Gemini 3.1 Flash Lite",
        pass,
        expected: expectedModel.modelName,
        actual: modelUsed?.modelName ?? "none",
      });

      expect(result.text.trim().length).toBeGreaterThan(0);
      expect(modelUsed).toEqual(expectedModel);
    },
    TIMEOUT,
  );

  afterAll(() => {
    evalReporter.printReport();
  });
});
