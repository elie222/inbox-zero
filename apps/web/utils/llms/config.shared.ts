// Shared config that can be safely imported by both client and server code
// NO environment variables should be accessed in this file

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
