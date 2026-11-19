import { getEmailAccount } from "@/__tests__/helpers";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { Provider } from "@/utils/llms/config";

/**
 * Which model is under test, and how to authenticate it. Kept free of vitest so
 * standalone eval scripts running under tsx can select a model the same way the
 * vitest matrix does.
 */
export interface EvalModel {
  includeInAll?: boolean;
  label: string;
  model: string;
  provider: string;
}

// Keep this to the models we actively ship on. Anything else can still be run
// with a custom EVAL_MODELS JSON entry, so agents don't spend on it by default.
export const EVAL_MODEL_CATALOG: Record<string, EvalModel> = {
  "gpt-6-luna": {
    provider: "openrouter",
    model: "openai/gpt-6-luna",
    label: "GPT-6 Luna",
  },
  "claude-haiku-5.5": {
    provider: "openrouter",
    model: "anthropic/claude-haiku-5.5",
    label: "Claude Haiku 5.5",
  },
  "gpt-5.6-luna-azure": {
    provider: "azure-foundry",
    model: "gpt-5.6-luna",
    label: "GPT-5.6 Luna Azure",
    includeInAll: false,
  },
};

/**
 * Returns the list of models to evaluate against.
 *
 * - Not set:                         single run with the default model from describeEvalMatrix
 * - EVAL_MODELS=all                  every model in the catalog
 * - EVAL_MODELS=gpt-6-luna           single model by shorthand
 * - EVAL_MODELS=gpt-6-luna,claude-haiku-5.5   comma-separated shorthand picks
 * - EVAL_MODELS=[{...}]             custom JSON array, for any other model
 */
export function getEvalModels(): EvalModel[] {
  const envModels = process.env.EVAL_MODELS;
  if (!envModels) return [];
  if (envModels === "all") {
    return Object.entries(EVAL_MODEL_CATALOG)
      .filter(([, model]) => model.includeInAll !== false)
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
      // Throw rather than skip: an empty list falls back to the default
      // model, which would spend on a run nobody asked for.
      if (!preset) {
        throw new Error(
          `Unknown eval model shorthand: "${name}". Available: ${Object.keys(EVAL_MODEL_CATALOG).join(", ")}. Use a JSON array for other models.`,
        );
      }
      return preset;
    });
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

function getApiKeyForProvider(provider: string): string | null {
  const keys: Record<string, string | undefined> = {
    openrouter: process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    groq: process.env.GROQ_API_KEY,
    cerebras: process.env.CEREBRAS_API_KEY,
    [Provider.AZURE_FOUNDRY]: process.env.AZURE_FOUNDRY_API_KEY,
    "openai-compatible": process.env.LLM_API_KEY || "not-required",
    ollama: "ollama-local",
  };
  return keys[provider] ?? null;
}
