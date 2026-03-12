import { describe } from "vitest";
import { getEmailAccount } from "@/__tests__/helpers";
import type { EmailAccountWithAI } from "@/utils/llms/types";

export interface EvalModel {
  provider: string;
  model: string;
  label: string;
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
  "grok-4.1-fast": {
    provider: "openrouter",
    model: "x-ai/grok-4.1-fast",
    label: "Grok 4.1 Fast",
  },
  "gpt-5-nano": {
    provider: "openrouter",
    model: "openai/gpt-5-nano",
    label: "GPT-5 Nano",
  },
};

/**
 * Returns the list of models to evaluate against.
 *
 * - Not set:                         single run with default env-configured model
 * - EVAL_MODELS=all                  every model in the catalog
 * - EVAL_MODELS=gemini-2.5-flash     single model by shorthand
 * - EVAL_MODELS=gemini-2.5-flash,grok-4.1-fast   comma-separated shorthand picks
 * - EVAL_MODELS=[{...}]             custom JSON array
 */
export function getEvalModels(): EvalModel[] {
  const envModels = process.env.EVAL_MODELS;
  if (!envModels) return [];
  if (envModels === "all") return Object.values(EVAL_MODEL_CATALOG);

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
    const fallback = EVAL_MODEL_CATALOG["gemini-3.1-flash-lite"];
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
  };
  return keys[provider] ?? null;
}
