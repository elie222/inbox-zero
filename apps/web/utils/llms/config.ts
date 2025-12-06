import { env } from "@/env";
import {
  DEFAULT_PROVIDER,
  Provider,
  getProviderOptions,
} from "./config.shared";

// Re-export shared config for convenience
export { DEFAULT_PROVIDER, Provider, getProviderOptions };

// Whether users can configure their own AI provider URL (Ollama, LM Studio, etc.)
// Disabled by default for security (SSRF risk). Enable via ALLOW_USER_AI_PROVIDER_URL=true
// WARNING: Enabling this allows users to set custom server URLs which could be used
// to probe internal networks. Only enable if you trust your users or run in isolation.
export const allowUserAiProviderUrl = env.ALLOW_USER_AI_PROVIDER_URL ?? false;

// Ollama is only available if:
// 1. Admin has configured OLLAMA_BASE_URL, OR
// 2. User AI provider URL is enabled (users can set their own URL)
export const supportsOllama = !!env.OLLAMA_BASE_URL || allowUserAiProviderUrl;

// LM Studio is available if:
// 1. Admin has configured LM_STUDIO_BASE_URL, OR
// 2. User AI provider URL is enabled (users can set their own URL)
export const supportsLmStudio =
  !!env.LM_STUDIO_BASE_URL || allowUserAiProviderUrl;

// Only include local providers in provider options if they're supported
// NOTE: This static export should only be used on server-side code.
// For client components, use getProviderOptions() with support flags from API.
export const providerOptions: { label: string; value: string }[] =
  getProviderOptions({
    ollamaSupported: supportsOllama,
    lmStudioSupported: supportsLmStudio,
  });
