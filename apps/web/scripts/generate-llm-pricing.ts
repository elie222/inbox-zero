// eslint-disable no-process-env
// Run with: `pnpm --filter inbox-zero-ai exec tsx scripts/generate-llm-pricing.ts`
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  OPENROUTER_MODEL_ID_BY_SUPPORTED_MODEL,
  STATIC_MODEL_PRICING,
} from "../utils/llms/supported-model-pricing";

const OPENROUTER_MODELS_URLS = [
  "https://openrouter.ai/api/v1/models/list-models-user",
  "https://openrouter.ai/api/v1/models",
];
const OUTPUT_FILE = new URL(
  "../utils/llms/pricing.generated.ts",
  import.meta.url,
);
const COMMON_OPENROUTER_MODEL_IDS = [
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-5-nano",
  "x-ai/grok-4-fast",
] as const;
const COMMON_MODEL_ALIASES: Record<string, string> = {
  "anthropic/claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
  "anthropic/claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
  "anthropic/claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
  "claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
  "openai/gpt-5-nano-2025-08-07": "openai/gpt-5-nano",
  "gpt-5-nano": "openai/gpt-5-nano",
  "x-ai/grok-4-fast-2025-08-28": "x-ai/grok-4-fast",
  "grok-4-fast": "x-ai/grok-4-fast",
};

const openRouterModelSchema = z.object({
  id: z.string(),
  pricing: z
    .object({
      prompt: z.union([z.string(), z.number(), z.null()]).optional(),
      completion: z.union([z.string(), z.number(), z.null()]).optional(),
      input_cache_read: z.union([z.string(), z.number(), z.null()]).optional(),
    })
    .optional(),
});
const openRouterModelsResponseSchema = z.object({
  data: z.array(openRouterModelSchema),
});

type OpenRouterModel = z.infer<typeof openRouterModelSchema>;
type OpenRouterModelsResponse = z.infer<typeof openRouterModelsResponseSchema>;

type ModelPricing = {
  input: number;
  output: number;
  cachedInput: number;
};

async function main() {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (process.env.OPENROUTER_API_KEY) {
    headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
  }

  const payload = await fetchOpenRouterModels(headers);
  const pricingByModel = buildPricingMap(payload);
  const fileContents = renderGeneratedFile(pricingByModel);

  await writeFile(OUTPUT_FILE, fileContents, "utf8");

  console.log(
    `Generated ${Object.keys(pricingByModel).length} pricing entries at ${fileURLToPath(OUTPUT_FILE)}`,
  );
}

async function fetchOpenRouterModels(headers: Record<string, string>) {
  let lastError: Error | null = null;

  for (const url of OPENROUTER_MODELS_URLS) {
    const response = await fetch(url, { headers });
    if (response.ok) {
      const json = (await response.json()) as unknown;
      const parsed = openRouterModelsResponseSchema.safeParse(json);

      if (parsed.success) return parsed.data;

      const issues = parsed.error.issues
        .map((issue) => {
          const path = issue.path.length ? issue.path.join(".") : "root";
          return `${path}: ${issue.message}`;
        })
        .join("; ");
      lastError = new Error(
        `Invalid OpenRouter models response from ${url}: ${issues}`,
      );
      continue;
    }

    if (response.status === 404) continue;

    lastError = new Error(
      `Failed to fetch OpenRouter models from ${url}: [${response.status}] ${await response.text()}`,
    );
  }

  if (lastError) throw lastError;

  throw new Error(
    `Failed to fetch OpenRouter models from all endpoints: ${OPENROUTER_MODELS_URLS.join(", ")}`,
  );
}

function buildPricingMap(payload: OpenRouterModelsResponse) {
  const openRouterPricingByModelId: Record<string, ModelPricing> = {};

  for (const model of payload.data) {
    const pricing = parsePricing(model.pricing);
    if (!pricing) continue;
    openRouterPricingByModelId[model.id] = pricing;
  }

  const pricingByModelId: Record<string, ModelPricing> = {};
  const unresolvedModels: string[] = [];
  const targetModelIds = [
    ...Object.keys(STATIC_MODEL_PRICING),
    ...COMMON_OPENROUTER_MODEL_IDS,
  ].sort((a, b) => a.localeCompare(b));

  for (const targetModelId of targetModelIds) {
    if (pricingByModelId[targetModelId]) continue;

    const candidateModelIds = buildOpenRouterModelIdCandidates(targetModelId);
    const matchedPricing = candidateModelIds
      .map((candidateModelId) => openRouterPricingByModelId[candidateModelId])
      .find(Boolean);

    if (!matchedPricing) {
      unresolvedModels.push(targetModelId);
      continue;
    }

    pricingByModelId[targetModelId] = matchedPricing;
  }

  for (const [alias, canonicalModelId] of Object.entries(
    COMMON_MODEL_ALIASES,
  )) {
    const canonicalPricing = pricingByModelId[canonicalModelId];
    if (canonicalPricing) {
      pricingByModelId[alias] = canonicalPricing;
    }
  }

  const unresolvedSupportedModels = unresolvedModels.filter((modelId) =>
    Object.hasOwn(STATIC_MODEL_PRICING, modelId),
  );

  if (unresolvedSupportedModels.length) {
    console.log(
      `No OpenRouter pricing match for ${unresolvedSupportedModels.length} supported models`,
    );
  }

  return Object.fromEntries(
    Object.entries(pricingByModelId).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function parsePricing(pricing: OpenRouterModel["pricing"]) {
  if (!pricing) return null;

  const input = parsePrice(pricing.prompt);
  const output = parsePrice(pricing.completion);
  if (input === null || output === null) return null;

  const cachedInput = parsePrice(pricing.input_cache_read) ?? input;

  return {
    input,
    output,
    cachedInput,
  } satisfies ModelPricing;
}

function parsePrice(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildOpenRouterModelIdCandidates(supportedModelId: string): string[] {
  const noOnlineSuffix = supportedModelId.endsWith(":online")
    ? supportedModelId.slice(0, -":online".length)
    : supportedModelId;

  const candidates = [
    OPENROUTER_MODEL_ID_BY_SUPPORTED_MODEL[supportedModelId],
    supportedModelId,
    noOnlineSuffix,
  ].filter(Boolean) as string[];

  if (!noOnlineSuffix.includes("/")) {
    candidates.push(
      `openai/${noOnlineSuffix}`,
      `anthropic/${noOnlineSuffix}`,
      `google/${noOnlineSuffix}`,
      `meta-llama/${noOnlineSuffix}`,
      `moonshotai/${noOnlineSuffix}`,
    );
  }

  return [...new Set(candidates)];
}

function renderGeneratedFile(pricingByModel: Record<string, ModelPricing>) {
  const serializedPricing = JSON.stringify(pricingByModel, null, 2);

  return [
    "// This file is auto-generated by scripts/generate-llm-pricing.ts",
    "// Do not edit this file manually.",
    "// Contains OpenRouter pricing for supported models plus selected common model aliases.",
    "",
    "export type ModelPricing = {",
    "  input: number;",
    "  output: number;",
    "  cachedInput: number;",
    "};",
    "",
    `export const OPENROUTER_MODEL_PRICING: Record<string, ModelPricing> = ${serializedPricing};`,
    "",
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
