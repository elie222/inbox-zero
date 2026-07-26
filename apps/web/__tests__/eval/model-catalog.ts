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

export const EVAL_MODEL_CATALOG: Record<string, EvalModel> = {
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
  "gpt-5.6-luna": {
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
    label: "GPT-5.6 Luna",
  },
  "gpt-5.6-terra": {
    provider: "openrouter",
    model: "openai/gpt-5.6-terra",
    label: "GPT-5.6 Terra",
  },
  "gpt-5.6-luna-azure": {
    provider: "azure-foundry",
    model: "gpt-5.6-luna",
    label: "GPT-5.6 Luna Azure",
    includeInAll: false,
  },
  "gpt-5.6-terra-azure": {
    provider: "azure-foundry",
    model: "gpt-5.6-terra",
    label: "GPT-5.6 Terra Azure",
    includeInAll: false,
  },
  "deepseek-v4-pro-azure": {
    provider: "azure-foundry",
    model: "DeepSeek-V4-Pro",
    label: "DeepSeek V4 Pro Azure",
    includeInAll: false,
  },
  "deepseek-v4-flash-azure": {
    provider: "azure-foundry",
    model: "DeepSeek-V4-Flash",
    label: "DeepSeek V4 Flash Azure",
    includeInAll: false,
  },
  "ollama-gemma4-e2b": {
    provider: "ollama",
    model: "gemma4:e2b",
    label: "Ollama Gemma 4 E2B",
    includeInAll: false,
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

function getApiKeyForProvider(provider: string): string | null {
  const keys: Record<string, string | undefined> = {
    openrouter: process.env.OPENROUTER_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    groq: process.env.GROQ_API_KEY,
    [Provider.AZURE_FOUNDRY]: process.env.AZURE_FOUNDRY_API_KEY,
    "openai-compatible": process.env.LLM_API_KEY || "not-required",
    ollama: "ollama-local",
  };
  return keys[provider] ?? null;
}
