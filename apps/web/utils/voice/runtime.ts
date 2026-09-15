import { env } from "@/env";
import type { UserAIFields } from "@/utils/llms/types";
import {
  createVoiceProvider,
  resolveVoiceRuntime,
  toVoiceStatus,
} from "@/utils/voice/factory";

export function getVoiceRuntime(userAi?: UserAIFields | null) {
  return resolveVoiceRuntime({
    env: {
      NEXT_PUBLIC_VOICE_ENABLED: env.NEXT_PUBLIC_VOICE_ENABLED,
      VOICE_PROVIDER: env.VOICE_PROVIDER,
      VOICE_STT_MODEL: env.VOICE_STT_MODEL,
      VOICE_TTS_MODEL: env.VOICE_TTS_MODEL,
      VOICE_TTS_VOICE: env.VOICE_TTS_VOICE,
      VOICE_LIVE_MODEL: env.VOICE_LIVE_MODEL,
      VOICE_LIVE_VOICE: env.VOICE_LIVE_VOICE,
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      GROQ_API_KEY: env.GROQ_API_KEY,
    },
    userAi,
  });
}

export function getVoiceStatus(userAi?: UserAIFields | null) {
  return toVoiceStatus(getVoiceRuntime(userAi));
}

export function getConfiguredVoiceProvider(userAi?: UserAIFields | null) {
  return createVoiceProvider(getVoiceRuntime(userAi));
}
