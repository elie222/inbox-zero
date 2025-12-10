import { env } from "@/env";

export const DEFAULT_PROVIDER = "DEFAULT";

export const Provider = {
  OPEN_AI: "openai",
  ANTHROPIC: "anthropic",
  BEDROCK: "bedrock",
  GOOGLE: "google",
  GROQ: "groq",
  OPENROUTER: "openrouter",
  AI_GATEWAY: "aigateway",
  ...(env.OLLAMA_MODEL ? { OLLAMA: "ollama" } : {}),
};

export const providerOptions: { label: string; value: string }[] = [
  { label: "Default", value: DEFAULT_PROVIDER },
  { label: "Anthropic", value: Provider.ANTHROPIC },
  { label: "OpenAI", value: Provider.OPEN_AI },
  { label: "Google", value: Provider.GOOGLE },
  { label: "Groq", value: Provider.GROQ },
  { label: "OpenRouter", value: Provider.OPENROUTER },
  { label: "AI Gateway", value: Provider.AI_GATEWAY },
];
