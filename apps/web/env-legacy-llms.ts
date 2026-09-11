/* eslint-disable no-process-env */
type LegacyLlmEnv = Record<string, string | undefined>;

type LegacyLlmsEnv = {
  DEFAULT_LLMS: string | undefined;
  ECONOMY_LLMS: string | undefined;
  CHAT_LLMS: string | undefined;
  NANO_LLMS: string | undefined;
  DRAFT_LLMS: string | undefined;
};

type LegacyRoleLlmsConfig = {
  fallbackEnvName: string;
  fallbackToDefaultWithRoleFallbacks: boolean;
  modelEnvName: string;
  providerEnvName: string;
};

export const optionalEnvValue = (value: unknown): string | undefined => {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export function buildLegacyLlmsEnv(
  env: LegacyLlmEnv = process.env,
): LegacyLlmsEnv {
  return {
    DEFAULT_LLMS: buildLegacyDefaultLlms(env),
    ECONOMY_LLMS: buildLegacyRoleLlms(env, {
      providerEnvName: "ECONOMY_LLM_PROVIDER",
      modelEnvName: "ECONOMY_LLM_MODEL",
      fallbackEnvName: "ECONOMY_LLM_FALLBACKS",
      fallbackToDefaultWithRoleFallbacks: true,
    }),
    CHAT_LLMS: buildLegacyRoleLlms(env, {
      providerEnvName: "CHAT_LLM_PROVIDER",
      modelEnvName: "CHAT_LLM_MODEL",
      fallbackEnvName: "CHAT_LLM_FALLBACKS",
      fallbackToDefaultWithRoleFallbacks: true,
    }),
    NANO_LLMS: buildLegacyRoleLlms(env, {
      providerEnvName: "NANO_LLM_PROVIDER",
      modelEnvName: "NANO_LLM_MODEL",
      fallbackEnvName: "ECONOMY_LLM_FALLBACKS",
      fallbackToDefaultWithRoleFallbacks: false,
    }),
    DRAFT_LLMS: buildLegacyRoleLlms(env, {
      providerEnvName: "DRAFT_LLM_PROVIDER",
      modelEnvName: "DRAFT_LLM_MODEL",
      fallbackEnvName: "DEFAULT_LLM_FALLBACKS",
      fallbackToDefaultWithRoleFallbacks: false,
    }),
  };
}

function buildLegacyDefaultLlms(env: LegacyLlmEnv): string | undefined {
  const primary = buildLegacyModelEntry(env, {
    providerEnvName: "DEFAULT_LLM_PROVIDER",
    modelEnvName: "DEFAULT_LLM_MODEL",
    useProviderDefault: true,
  });
  if (!primary) return;

  return [primary, ...splitLegacyModelList(env.DEFAULT_LLM_FALLBACKS)].join(
    ",",
  );
}

function buildLegacyRoleLlms(
  env: LegacyLlmEnv,
  {
    fallbackEnvName,
    fallbackToDefaultWithRoleFallbacks,
    modelEnvName,
    providerEnvName,
  }: LegacyRoleLlmsConfig,
): string | undefined {
  const primary = buildLegacyModelEntry(env, {
    providerEnvName,
    modelEnvName,
    useProviderDefault: false,
  });
  const roleFallbacks = splitLegacyModelList(env[fallbackEnvName]);

  if (primary) {
    return [
      primary,
      ...(roleFallbacks.length
        ? roleFallbacks
        : splitLegacyModelList(env.DEFAULT_LLM_FALLBACKS)),
    ].join(",");
  }

  if (!fallbackToDefaultWithRoleFallbacks || !roleFallbacks.length) return;

  const defaultPrimary = buildLegacyModelEntry(env, {
    providerEnvName: "DEFAULT_LLM_PROVIDER",
    modelEnvName: "DEFAULT_LLM_MODEL",
    useProviderDefault: true,
  });
  if (!defaultPrimary) return;

  return [defaultPrimary, ...roleFallbacks].join(",");
}

function buildLegacyModelEntry(
  env: LegacyLlmEnv,
  {
    modelEnvName,
    providerEnvName,
    useProviderDefault,
  }: {
    modelEnvName: string;
    providerEnvName: string;
    useProviderDefault: boolean;
  },
): string | undefined {
  const provider = optionalEnvValue(env[providerEnvName]);
  if (!provider) return;

  const model =
    optionalEnvValue(env[modelEnvName]) ||
    (useProviderDefault
      ? getLegacyProviderDefaultModel(env, provider)
      : undefined);
  if (!model) return;

  return `${provider}:${model}`;
}

function splitLegacyModelList(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? []
  );
}

function getLegacyProviderDefaultModel(
  env: LegacyLlmEnv,
  provider: string,
): string | undefined {
  const defaultModelByLegacyProvider: Record<string, string | undefined> = {
    anthropic: "claude-sonnet-4-6",
    azure: "gpt-5.4-mini",
    vertex: "gemini-3-flash",
    google: "gemini-2.0-flash",
    openai: "gpt-5.4-mini",
    bedrock: "global.anthropic.claude-sonnet-4-6",
    openrouter: "anthropic/claude-sonnet-4.6",
    groq: "llama-3.3-70b-versatile",
    aigateway: "anthropic/claude-sonnet-4.6",
    ollama: env.OLLAMA_MODEL,
    "openai-compatible": env.OPENAI_COMPATIBLE_MODEL,
    "codex-cli": "gpt-5.3-codex",
    "claude-code": "sonnet",
  };

  return defaultModelByLegacyProvider[provider];
}
