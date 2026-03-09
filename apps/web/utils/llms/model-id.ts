const OPENROUTER_PROVIDER_PREFIX_BY_PROVIDER: Record<string, string> = {
  openai: "openai",
  azure: "openai",
  "openai-compatible": "openai",
  anthropic: "anthropic",
  bedrock: "anthropic",
  google: "google",
  groq: "groq",
};

export function stripOnlineModelSuffix(model: string): string {
  return model.endsWith(":online") ? model.slice(0, -":online".length) : model;
}

export function getOpenRouterProviderPrefix(provider: string): string | null {
  return OPENROUTER_PROVIDER_PREFIX_BY_PROVIDER[provider.toLowerCase()] || null;
}
