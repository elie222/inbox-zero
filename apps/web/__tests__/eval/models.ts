import { describe } from "vitest";
import {
  EVAL_MODEL_CATALOG,
  getEmailAccountForModel,
  getEvalModels,
  type EvalModel,
} from "@/__tests__/eval/model-catalog";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { Provider } from "@/utils/llms/config";

export function shouldRunEvalTests(): boolean {
  if (process.env.RUN_AI_TESTS !== "true") return false;

  const models = getEvalModels();
  if (models.length > 0) {
    return models.every((model) => hasConfiguredProvider(model.provider));
  }

  const defaultProvider = getDefaultEvalProvider();
  return defaultProvider
    ? hasConfiguredProvider(defaultProvider)
    : hasAnyConfiguredProvider();
}

/**
 * Runs a describe block for each model in the eval matrix.
 *
 * When EVAL_MODELS is not set, runs a single block using the catalog's
 * default model (deepseek-v4-flash), so results are comparable across
 * machines regardless of local env model configuration.
 *
 * When EVAL_MODELS=all or a JSON array, runs one block per model
 * with the emailAccount configured to route through that model.
 *
 * Usage:
 *   describeEvalMatrix("feature name", (model, emailAccount) => {
 *     test("case", async () => {
 *       const result = await aiFunction({ emailAccount, ... });
 *       expect(result).toBe(expected);
 *     });
 *   });
 */
export function describeEvalMatrix(
  name: string,
  fn: (model: EvalModel, emailAccount: EmailAccountWithAI) => void,
  overrides?: Partial<EmailAccountWithAI>,
): void {
  const models = getEvalModels();

  if (models.length === 0) {
    const fallback = EVAL_MODEL_CATALOG["deepseek-v4-flash"];
    describe(name, () => {
      fn(fallback, getEmailAccountForModel(fallback, overrides));
    });
    return;
  }

  for (const model of models) {
    describe(`${name} [${model.label}]`, () => {
      fn(model, getEmailAccountForModel(model, overrides));
    });
  }
}

function getDefaultEvalProvider(): string | undefined {
  return process.env.DEFAULT_LLMS?.split(",").find(Boolean)?.split(":", 1)[0];
}

function hasConfiguredProvider(provider: string): boolean {
  if (provider === Provider.AZURE_FOUNDRY) return hasAzureFoundryCredentials();

  if (process.env.LLM_API_KEY) return true;

  switch (provider) {
    case Provider.OPENROUTER:
      return Boolean(process.env.OPENROUTER_API_KEY);
    case Provider.OPEN_AI:
      return Boolean(process.env.OPENAI_API_KEY);
    case Provider.AZURE:
      return Boolean(
        process.env.AZURE_API_KEY && process.env.AZURE_RESOURCE_NAME,
      );
    case Provider.AZURE_FOUNDRY:
      return hasAzureFoundryCredentials();
    case Provider.ANTHROPIC:
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case Provider.GOOGLE:
      return Boolean(process.env.GOOGLE_API_KEY);
    case Provider.VERTEX:
      return Boolean(process.env.GOOGLE_VERTEX_PROJECT);
    case Provider.GROQ:
      return Boolean(process.env.GROQ_API_KEY);
    case Provider.BEDROCK:
      return Boolean(
        process.env.BEDROCK_ACCESS_KEY &&
          process.env.BEDROCK_SECRET_KEY &&
          process.env.BEDROCK_REGION,
      );
    case Provider.AI_GATEWAY:
      return Boolean(process.env.AI_GATEWAY_API_KEY);
    case Provider.OPENAI_COMPATIBLE:
    case Provider.OLLAMA:
      return true;
    default:
      return hasAnyConfiguredProvider();
  }
}

function hasAnyConfiguredProvider(): boolean {
  return Boolean(
    process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.AZURE_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_VERTEX_PROJECT ||
      process.env.GROQ_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      hasAzureFoundryCredentials() ||
      process.env.AI_GATEWAY_API_KEY ||
      (process.env.BEDROCK_ACCESS_KEY &&
        process.env.BEDROCK_SECRET_KEY &&
        process.env.BEDROCK_REGION) ||
      process.env.OPENAI_COMPATIBLE_BASE_URL ||
      process.env.OLLAMA_BASE_URL,
  );
}

function hasAzureFoundryCredentials(): boolean {
  return Boolean(
    process.env.AZURE_FOUNDRY_API_KEY && process.env.AZURE_FOUNDRY_BASE_URL,
  );
}
