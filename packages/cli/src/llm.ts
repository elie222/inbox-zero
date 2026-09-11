import { cancel, group, isCancel, log, text } from "@clack/prompts";
import type { EnvConfig } from "./utils";

export const LLM_PROVIDER_OPTIONS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (ChatGPT)" },
  { value: "google", label: "Google (Gemini)" },
  {
    value: "openrouter",
    label: "OpenRouter",
    hint: "access multiple models",
  },
  {
    value: "aigateway",
    label: "Vercel AI Gateway",
    hint: "access multiple models",
  },
  { value: "bedrock", label: "AWS Bedrock" },
  { value: "groq", label: "Groq" },
  { value: "ollama", label: "Ollama", hint: "self-hosted" },
  {
    value: "openai-compatible",
    label: "OpenAI-Compatible",
    hint: "self-hosted (LM Studio, vLLM, etc.)",
  },
] as const;

const LLM_LINKS: Record<string, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
  openrouter: "https://openrouter.ai/settings/keys",
  aigateway: "https://vercel.com/docs/ai-gateway",
  groq: "https://console.groq.com/keys",
};

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/api";

const DEFAULT_MODELS = {
  anthropic: {
    default: "claude-sonnet-4-6",
    economy: "claude-haiku-4-5-20251001",
  },
  openai: { default: "gpt-5.4-mini", economy: "gpt-5.4-nano" },
  google: { default: "gemini-3-flash", economy: "gemini-2-5-flash" },
  openrouter: {
    default: "anthropic/claude-sonnet-4.6",
    economy: "anthropic/claude-haiku-4.5",
  },
  aigateway: {
    default: "anthropic/claude-sonnet-4.6",
    economy: "anthropic/claude-haiku-4.5",
  },
  bedrock: {
    default: "global.anthropic.claude-sonnet-4-6",
    economy: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  },
  groq: {
    default: "llama-3.3-70b-versatile",
    economy: "llama-3.1-8b-instant",
  },
} as const;

type DefaultModelProvider = keyof typeof DEFAULT_MODELS;

export function seedLlmPlaceholderCredentials(
  provider: string,
  env: EnvConfig,
): void {
  if (provider === "openai-compatible") {
    env.OPENAI_COMPATIBLE_BASE_URL = "http://localhost:1234/v1";
    env.OPENAI_COMPATIBLE_MODEL = "qwen3.5:4b";
    setRoleLlms(provider, env.OPENAI_COMPATIBLE_MODEL, env);
    env.LLM_API_KEY = "replace-me";
    return;
  }

  if (provider === "ollama") {
    env.OLLAMA_BASE_URL = DEFAULT_OLLAMA_BASE_URL;
    env.OLLAMA_MODEL = "qwen3.5:4b";
    setRoleLlms(provider, env.OLLAMA_MODEL, env);
    return;
  }

  const models = getDefaultLlmModels(provider);
  setRoleLlms(provider, models.default, env, models.economy);

  if (provider === "bedrock") {
    env.BEDROCK_ACCESS_KEY = "replace-me";
    env.BEDROCK_SECRET_KEY = "replace-me";
    env.BEDROCK_REGION = "us-west-2";
    return;
  }

  env.LLM_API_KEY = "replace-me";
}

export async function promptLlmCredentials(
  provider: string,
  env: EnvConfig,
): Promise<void> {
  if (provider === "openai-compatible") {
    const creds = await promptOpenAICompatibleCreds();
    env.OPENAI_COMPATIBLE_BASE_URL = creds.baseUrl;
    env.OPENAI_COMPATIBLE_MODEL = creds.model;
    if (creds.apiKey) env.LLM_API_KEY = creds.apiKey;
    setRoleLlms(provider, creds.model, env);
    return;
  }

  if (provider === "ollama") {
    const ollama = await promptOllamaCreds();
    env.OLLAMA_BASE_URL = ollama.baseUrl;
    env.OLLAMA_MODEL = ollama.model;
    setRoleLlms(provider, ollama.model, env);
    return;
  }

  const models = getDefaultLlmModels(provider);
  setRoleLlms(provider, models.default, env, models.economy);

  if (provider === "bedrock") {
    const bedrock = await promptBedrockCreds();
    env.BEDROCK_ACCESS_KEY = bedrock.accessKey;
    env.BEDROCK_SECRET_KEY = bedrock.secretKey;
    env.BEDROCK_REGION = bedrock.region;
    return;
  }

  env.LLM_API_KEY = await promptApiKey(provider);
}

export function getDefaultLlmModels(provider: string) {
  const models = DEFAULT_MODELS[provider as DefaultModelProvider];
  if (models) return models;

  throw new Error(`Unsupported LLM provider: ${provider}`);
}

function setRoleLlms(
  provider: string,
  defaultModel: string,
  env: EnvConfig,
  economyModel = defaultModel,
) {
  env.DEFAULT_LLMS = `${provider}:${defaultModel}`;
  env.ECONOMY_LLMS = `${provider}:${economyModel}`;
}

function cancelSetup(): never {
  cancel("Setup cancelled.");
  process.exit(0);
}

async function promptOllamaCreds(): Promise<{
  baseUrl: string;
  model: string;
}> {
  const creds = await group(
    {
      baseUrl: () =>
        text({
          message: "Ollama Base URL",
          placeholder: DEFAULT_OLLAMA_BASE_URL,
          initialValue: DEFAULT_OLLAMA_BASE_URL,
        }),
      model: () =>
        text({
          message: "Ollama Model",
          placeholder: "qwen3.5:4b",
          initialValue: "qwen3.5:4b",
          validate: (value) => (!value ? "Model name is required" : undefined),
        }),
    },
    { onCancel: cancelSetup },
  );

  return {
    baseUrl: creds.baseUrl || DEFAULT_OLLAMA_BASE_URL,
    model: creds.model,
  };
}

async function promptOpenAICompatibleCreds(): Promise<{
  baseUrl: string;
  model: string;
  apiKey?: string;
}> {
  const creds = await group(
    {
      baseUrl: () =>
        text({
          message: "OpenAI-Compatible Base URL",
          placeholder: "http://localhost:1234/v1",
          initialValue: "http://localhost:1234/v1",
        }),
      model: () =>
        text({
          message: "Model Name",
          placeholder: "qwen3.5:4b",
          initialValue: "qwen3.5:4b",
          validate: (value) => (!value ? "Model name is required" : undefined),
        }),
      apiKey: () =>
        text({
          message: "API Key (optional - press Enter to skip)",
          placeholder: "leave blank if not required",
        }),
    },
    { onCancel: cancelSetup },
  );

  return {
    baseUrl: creds.baseUrl || "http://localhost:1234/v1",
    model: creds.model,
    apiKey: creds.apiKey || undefined,
  };
}

async function promptBedrockCreds(): Promise<{
  accessKey: string;
  secretKey: string;
  region: string;
}> {
  log.info(
    "Get your AWS credentials from the AWS Console:\nhttps://console.aws.amazon.com/iam/",
  );
  const creds = await group(
    {
      accessKey: () =>
        text({
          message: "Bedrock Access Key",
          placeholder: "AKIA...",
          validate: (value) => (!value ? "Access key is required" : undefined),
        }),
      secretKey: () =>
        text({
          message: "Bedrock Secret Key",
          placeholder: "your-secret-key",
          validate: (value) => (!value ? "Secret key is required" : undefined),
        }),
      region: () =>
        text({
          message: "Bedrock Region",
          placeholder: "us-west-2",
          initialValue: "us-west-2",
        }),
    },
    { onCancel: cancelSetup },
  );

  return {
    accessKey: creds.accessKey,
    secretKey: creds.secretKey,
    region: creds.region || "us-west-2",
  };
}

async function promptApiKey(provider: string): Promise<string> {
  log.info(`Get your API key at:\n${LLM_LINKS[provider]}`);
  const apiKey = await text({
    message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} API Key`,
    placeholder: "paste your API key here",
    validate: (value) => (!value ? "API key is required" : undefined),
  });

  if (isCancel(apiKey)) cancelSetup();
  return apiKey;
}
