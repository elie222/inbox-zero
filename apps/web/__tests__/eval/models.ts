import { describe } from "vitest";
import { getEmailAccount } from "@/__tests__/helpers";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { Provider } from "@/utils/llms/config";

export interface EvalModel {
  label: string;
  model: string;
  provider: string;
}

const EVAL_MODEL_CATALOG: Record<string, EvalModel> = {
  "gemini-3-flash": {
    provider: "openrouter",
    model: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash",
  },
  "gemini-2.5-flash": {
    provider: "openrouter",
    model: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
  },
  "gemini-3.1-flash-lite": {
    provider: "openrouter",
    model: "google/gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
  },
  "gpt-5.4-nano": {
    provider: "openrouter",
    model: "openai/gpt-5.4-nano",
    label: "GPT-5.4 Nano",
  },
  "gpt-5.4-mini": {
    provider: "openrouter",
    model: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
  },
  "ollama-gemma4-e2b": {
    provider: "ollama",
    model: "gemma4:e2b",
    label: "Ollama Gemma 4 E2B",
  },
};

/**
 * Returns the list of models to evaluate against.
 *
 * - Not set:                         single run with default env-configured model
 * - EVAL_MODELS=all                  every model in the catalog
 * - EVAL_MODELS=gemini-2.5-flash     single model by shorthand
 * - EVAL_MODELS=gemini-2.5-flash,gpt-5.4-mini   comma-separated shorthand picks
 * - EVAL_MODELS=[{...}]             custom JSON array
 */
export function getEvalModels(): EvalModel[] {
  const envModels = process.env.EVAL_MODELS;
  if (!envModels) return [];
  if (envModels === "all") {
    return Object.entries(EVAL_MODEL_CATALOG)
      .filter(([name]) => !name.includes("ollama"))
      .map(([, model]) => model);
  }

  if (envModels.startsWith("[")) {
    try {
      return JSON.parse(envModels);
    } catch {
      return [];
    }
  }

  return envModels
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const preset = EVAL_MODEL_CATALOG[name];
      if (!preset) {
        console.warn(
          `Unknown eval model shorthand: "${name}". Available: ${Object.keys(EVAL_MODEL_CATALOG).join(", ")}`,
        );
      }
      return preset;
    })
    .filter((m): m is EvalModel => m != null);
}

export function getEmailAccountForModel(
  model: EvalModel,
  overrides: Partial<EmailAccountWithAI> = {},
): EmailAccountWithAI {
  return {
    ...getEmailAccount(overrides),
    user: {
      aiProvider: model.provider,
      aiModel: model.model,
      aiApiKey: getApiKeyForProvider(model.provider),
    },
  };
}

export function shouldRunEvalTests(): boolean {
  if (process.env.RUN_AI_TESTS !== "true") return false;

  const models = getEvalModels();
  if (models.length > 0) {
    return models.every((model) => hasConfiguredProvider(model.provider));
  }

  const defaultProvider = process.env.DEFAULT_LLM_PROVIDER;
  return defaultProvider
    ? hasConfiguredProvider(defaultProvider)
    : hasAnyConfiguredProvider();
}

/**
 * Runs a describe block for each model in the eval matrix.
 *
 * When EVAL_MODELS is not set, runs a single block using the default
 * env-configured model (identical to normal test behavior).
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
    const fallback = EVAL_MODEL_CATALOG["gemini-3-flash"];
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

function getApiKeyForProvider(provider: string): string | null {
  const keys: Record<string, string | undefined> = {
    openrouter: process.env.OPENROUTER_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    groq: process.env.GROQ_API_KEY,
    "openai-compatible": process.env.LLM_API_KEY || "not-required",
    ollama: "ollama-local",
  };
  return keys[provider] ?? null;
}

function hasConfiguredProvider(provider: string): boolean {
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
      process.env.AI_GATEWAY_API_KEY ||
      (process.env.BEDROCK_ACCESS_KEY &&
        process.env.BEDROCK_SECRET_KEY &&
        process.env.BEDROCK_REGION) ||
      process.env.OPENAI_COMPATIBLE_BASE_URL ||
      process.env.OLLAMA_BASE_URL,
  );
}
