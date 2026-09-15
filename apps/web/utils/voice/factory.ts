import { Provider } from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";
import { isVoiceProviderId, voiceCatalogEntry } from "@/utils/voice/catalog";
import { VoiceUnavailableError } from "@/utils/voice/errors";
import {
  DEFAULT_OPENAI_LIVE_VOICE,
  DEFAULT_OPENAI_TTS_VOICE,
} from "@/utils/voice/limits";
import { GroqVoiceProvider } from "@/utils/voice/providers/groq";
import { OpenAIVoiceProvider } from "@/utils/voice/providers/openai";
import type {
  VoiceProvider as VoiceProviderAdapter,
  VoiceProviderId,
  VoiceRuntimeConfig,
  VoiceStatus,
} from "@/utils/voice/types";

export type VoiceEnv = {
  NEXT_PUBLIC_VOICE_ENABLED?: boolean;
  VOICE_PROVIDER?: string;
  VOICE_STT_MODEL?: string;
  VOICE_TTS_MODEL?: string;
  VOICE_TTS_VOICE?: string;
  VOICE_LIVE_MODEL?: string;
  VOICE_LIVE_VOICE?: string;
  OPENAI_API_KEY?: string;
  GROQ_API_KEY?: string;
};

export function resolveVoiceRuntime(options: {
  env: VoiceEnv;
  userAi?: UserAIFields | null;
}): VoiceRuntimeConfig {
  const openaiApiKey = resolveOpenAiApiKey(options.env, options.userAi);
  const groqApiKey = options.env.GROQ_API_KEY?.trim() || undefined;
  const requested = options.env.VOICE_PROVIDER?.trim();
  const providerId = resolveProviderId({
    requested,
    openaiApiKey,
    groqApiKey,
  });

  return {
    enabled: options.env.NEXT_PUBLIC_VOICE_ENABLED !== false && !!providerId,
    providerId,
    openaiApiKey,
    groqApiKey,
    sttModel: options.env.VOICE_STT_MODEL?.trim() || undefined,
    ttsModel: options.env.VOICE_TTS_MODEL?.trim() || undefined,
    ttsVoice: options.env.VOICE_TTS_VOICE?.trim() || DEFAULT_OPENAI_TTS_VOICE,
    liveModel: options.env.VOICE_LIVE_MODEL?.trim() || undefined,
    liveVoice:
      options.env.VOICE_LIVE_VOICE?.trim() || DEFAULT_OPENAI_LIVE_VOICE,
  };
}

export function createVoiceProvider(
  config: VoiceRuntimeConfig,
): VoiceProviderAdapter {
  if (!config.enabled || !config.providerId) {
    throw new VoiceUnavailableError(
      "disabled",
      "Voice is not configured on this server.",
    );
  }

  switch (config.providerId) {
    case "openai": {
      if (!config.openaiApiKey) {
        throw new VoiceUnavailableError(
          "key",
          "Set OPENAI_API_KEY or an OpenAI user key to use voice.",
        );
      }
      return new OpenAIVoiceProvider({
        apiKey: config.openaiApiKey,
        sttModel: config.sttModel,
        ttsModel: config.ttsModel,
        liveModel: config.liveModel,
        liveVoice: config.liveVoice,
      });
    }
    case "groq": {
      if (!config.groqApiKey) {
        throw new VoiceUnavailableError(
          "key",
          "Set GROQ_API_KEY to use Groq voice dictation.",
        );
      }
      return new GroqVoiceProvider({
        apiKey: config.groqApiKey,
        sttModel: config.sttModel,
      });
    }
    default:
      throw new VoiceUnavailableError(
        "provider",
        `Unknown voice provider "${config.providerId}".`,
      );
  }
}

export function toVoiceStatus(config: VoiceRuntimeConfig): VoiceStatus {
  const entry = voiceCatalogEntry(config.providerId);
  const provider = config.enabled ? config.providerId : null;
  const capabilities = entry?.capabilities;
  return {
    enabled: Boolean(provider),
    provider,
    providerName: entry?.name ?? null,
    transcribe: Boolean(provider && capabilities?.transcribe),
    synthesize: Boolean(provider && capabilities?.synthesize),
    live: Boolean(provider && capabilities?.live),
    ttsVoice: capabilities?.synthesize ? (config.ttsVoice ?? null) : null,
    liveVoice: capabilities?.live ? (config.liveVoice ?? null) : null,
  };
}

const VOICE_METHODS = {
  transcribe: "transcribe",
  synthesize: "synthesize",
  live: "createLiveSession",
} as const;

export function requireVoiceCapability<K extends keyof typeof VOICE_METHODS>(
  provider: VoiceProviderAdapter,
  capability: K,
): NonNullable<VoiceProviderAdapter[(typeof VOICE_METHODS)[K]]> {
  const methodName = VOICE_METHODS[capability];
  const method = provider[methodName];
  if (!provider.capabilities[capability] || typeof method !== "function") {
    throw new VoiceUnavailableError(
      "capability",
      capability === "live"
        ? "This voice provider does not support live conversations."
        : capability === "synthesize"
          ? "This voice provider does not speak replies."
          : "This voice provider does not transcribe audio.",
    );
  }
  return method.bind(provider) as NonNullable<
    VoiceProviderAdapter[(typeof VOICE_METHODS)[K]]
  >;
}

function resolveOpenAiApiKey(
  env: VoiceEnv,
  userAi?: UserAIFields | null,
): string | undefined {
  if (userAi?.aiApiKey && userAi.aiProvider === Provider.OPEN_AI) {
    return userAi.aiApiKey;
  }
  return env.OPENAI_API_KEY?.trim() || undefined;
}

function resolveProviderId(options: {
  requested?: string;
  openaiApiKey?: string;
  groqApiKey?: string;
}): VoiceProviderId | null {
  if (options.requested) {
    if (!isVoiceProviderId(options.requested)) return null;
    if (options.requested === "openai" && !options.openaiApiKey) return null;
    if (options.requested === "groq" && !options.groqApiKey) return null;
    return options.requested;
  }
  if (options.openaiApiKey) return "openai";
  if (options.groqApiKey) return "groq";
  return null;
}
