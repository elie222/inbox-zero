import { env } from "@/env";

// Whether users can configure their own AI provider URL (Ollama, LM Studio, etc.)
// Disabled by default for security (SSRF risk). Enable via ALLOW_USER_AI_PROVIDER_URL=true
// WARNING: Enabling this allows users to set custom server URLs which could be used
// to probe internal networks. Only enable if you trust your users or run in isolation.
export const allowUserAiProviderUrl = env.ALLOW_USER_AI_PROVIDER_URL ?? false;

// Ollama is only available if:
// 1. Admin has configured OLLAMA_BASE_URL, OR
// 2. User AI provider URL is enabled (users can set their own URL)
export const supportsOllama = !!env.OLLAMA_BASE_URL || allowUserAiProviderUrl;

export const DEFAULT_PROVIDER = "DEFAULT";

export const Provider = {
  OPEN_AI: "openai",
  ANTHROPIC: "anthropic",
  BEDROCK: "bedrock",
  GOOGLE: "google",
  GROQ: "groq",
  OPENROUTER: "openrouter",
  AI_GATEWAY: "aigateway",
  OLLAMA: "ollama",
};

const baseProviderOptions: { label: string; value: string }[] = [
  { label: "Default", value: DEFAULT_PROVIDER },
  { label: "Anthropic", value: Provider.ANTHROPIC },
  { label: "OpenAI", value: Provider.OPEN_AI },
  { label: "Google", value: Provider.GOOGLE },
  { label: "Groq", value: Provider.GROQ },
  { label: "OpenRouter", value: Provider.OPENROUTER },
  { label: "AI Gateway", value: Provider.AI_GATEWAY },
];

// Function to get provider options based on Ollama support
// Use this on client components where supportsOllama is passed from server
export function getProviderOptions(
  ollamaSupported: boolean,
): { label: string; value: string }[] {
  return ollamaSupported
    ? [...baseProviderOptions, { label: "Ollama", value: Provider.OLLAMA }]
    : baseProviderOptions;
}

// Only include Ollama in provider options if it's supported
// NOTE: This static export should only be used on server-side code.
// For client components, use getProviderOptions() with supportsOllama from API.
export const providerOptions: { label: string; value: string }[] =
  supportsOllama
    ? [...baseProviderOptions, { label: "Ollama", value: Provider.OLLAMA }]
    : baseProviderOptions;
