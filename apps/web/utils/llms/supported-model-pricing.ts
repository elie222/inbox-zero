/** biome-ignore-all lint/style/noMagicNumbers: static pricing constants */
export type ModelPricing = {
  input: number;
  output: number;
  cachedInput?: number;
};

const sonnet = {
  input: 3 / 1_000_000,
  output: 15 / 1_000_000,
  cachedInput: 0.3 / 1_000_000,
};
const haiku = {
  input: 1 / 1_000_000,
  output: 5 / 1_000_000,
  cachedInput: 0.1 / 1_000_000,
};

const gemini2_5flash = {
  input: 0.15 / 1_000_000,
  output: 0.6 / 1_000_000,
};
const gemini2_5pro = {
  input: 1.25 / 1_000_000,
  output: 10 / 1_000_000,
};

const gemini3_0flash = {
  input: 0.5 / 1_000_000,
  output: 3 / 1_000_000,
};

const gemini3_0pro = {
  input: 2 / 1_000_000,
  output: 12 / 1_000_000,
};

export const STATIC_MODEL_PRICING: Record<string, ModelPricing> = {
  // https://openai.com/pricing
  "gpt-3.5-turbo-0125": {
    input: 0.5 / 1_000_000,
    output: 1.5 / 1_000_000,
  },
  "gpt-4o-mini": {
    input: 0.15 / 1_000_000,
    output: 0.6 / 1_000_000,
    cachedInput: 0.075 / 1_000_000,
  },
  "gpt-4-turbo": {
    input: 10 / 1_000_000,
    output: 30 / 1_000_000,
  },
  "gpt-4o": {
    input: 5 / 1_000_000,
    output: 15 / 1_000_000,
    cachedInput: 2.5 / 1_000_000,
  },
  "gpt-5-mini": {
    input: 0.25 / 1_000_000,
    output: 2 / 1_000_000,
    cachedInput: 0.025 / 1_000_000,
  },
  "gpt-5.1": {
    input: 1.25 / 1_000_000,
    output: 10 / 1_000_000,
    cachedInput: 0.125 / 1_000_000,
  },
  // https://www.anthropic.com/pricing#anthropic-api
  "claude-3-5-sonnet-20240620": sonnet,
  "claude-3-5-sonnet-20241022": sonnet,
  "claude-3-7-sonnet-20250219": sonnet,
  "claude-sonnet-4-5-20250929": sonnet,
  "anthropic/claude-3.5-sonnet": sonnet,
  "anthropic/claude-3.7-sonnet": sonnet,
  "anthropic/claude-sonnet-4": sonnet,
  "anthropic/claude-sonnet-4.5": sonnet,
  "anthropic/claude-haiku-4.5": haiku,
  // https://aws.amazon.com/bedrock/pricing/
  "anthropic.claude-3-5-sonnet-20240620-v1:0": sonnet,
  "anthropic.claude-3-5-sonnet-20241022-v2:0": sonnet,
  "us.anthropic.claude-3-5-sonnet-20241022-v2:0": sonnet,
  "us.anthropic.claude-3-7-sonnet-20250219-v1:0": sonnet,
  "us.anthropic.claude-sonnet-4-20250514-v1:0": sonnet,
  "global.anthropic.claude-sonnet-4-5-20250929-v1:0": sonnet,
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": haiku,
  "anthropic.claude-3-5-haiku-20241022-v1:0": {
    input: 0.8 / 1_000_000,
    output: 4 / 1_000_000,
  },
  "us.anthropic.claude-3-5-haiku-20241022-v1:0": {
    input: 0.8 / 1_000_000,
    output: 4 / 1_000_000,
  },
  // https://ai.google.dev/pricing
  "gemini-1.5-pro-latest": {
    input: 1.25 / 1_000_000,
    output: 5 / 1_000_000,
  },
  "gemini-1.5-flash-latest": {
    input: 0.075 / 1_000_000,
    output: 0.3 / 1_000_000,
  },
  "gemini-2.0-flash-lite": {
    input: 0.075 / 1_000_000,
    output: 0.3 / 1_000_000,
  },
  "gemini-2.0-flash": gemini2_5flash,
  "gemini-2.5-flash": gemini2_5flash,
  "gemini-3-flash": gemini3_0flash,
  "gemini-3-flash-preview": gemini3_0flash,
  "gemini-3-pro": gemini3_0pro,
  "gemini-3-pro-preview": gemini3_0pro,
  "google/gemini-2.0-flash-001": gemini2_5flash,
  "google/gemini-2.5-flash-preview-05-20": gemini2_5flash,
  "google/gemini-2.5-pro-preview-03-25": gemini2_5pro,
  "google/gemini-2.5-pro-preview-06-05": gemini2_5pro,
  "google/gemini-2.5-pro-preview": gemini2_5pro,
  "google/gemini-2.5-pro": gemini2_5pro,
  "google/gemini-3-flash": gemini3_0flash,
  "google/gemini-3-flash-preview": gemini3_0flash,
  "google/gemini-3-pro": gemini3_0pro,
  "google/gemini-3-pro-preview": gemini3_0pro,
  "meta-llama/llama-4-maverick": {
    input: 0.2 / 1_000_000,
    output: 0.85 / 1_000_000,
  },
  // Kimi K2 Groq via OpenRouter - https://openrouter.ai/moonshotai/kimi-k2
  "moonshotai/kimi-k2": {
    input: 1 / 1_000_000,
    output: 3 / 1_000_000,
  },
  // https://groq.com/pricing
  "llama-3.3-70b-versatile": {
    input: 0.59 / 1_000_000,
    output: 0.79 / 1_000_000,
  },
};

// Source model ids to use when fetching OpenRouter pricing for our supported models.
// Keys are our internal model ids from STATIC_MODEL_PRICING.
export const OPENROUTER_MODEL_ID_BY_SUPPORTED_MODEL: Partial<
  Record<string, string>
> = {
  "gpt-3.5-turbo-0125": "openai/gpt-3.5-turbo",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4-turbo": "openai/gpt-4-turbo",
  "gpt-4o": "openai/gpt-4o",
  "gpt-5-mini": "openai/gpt-5-mini",
  "gpt-5.1": "openai/gpt-5.1",
  "claude-3-5-sonnet-20240620": "anthropic/claude-3.5-sonnet",
  "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
  "claude-3-7-sonnet-20250219": "anthropic/claude-3.7-sonnet",
  "claude-sonnet-4-5-20250929": "anthropic/claude-sonnet-4.5",
  "gemini-2.0-flash": "google/gemini-2.0-flash-001",
  "gemini-2.5-flash": "google/gemini-2.5-flash",
  "gemini-3-flash": "google/gemini-3-flash-preview",
  "gemini-3-pro": "google/gemini-3-pro-preview",
};
