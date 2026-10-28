export const MAX_TRANSCRIBE_BYTES = 8 * 1024 * 1024;
export const MAX_SPEAK_CHARS = 2000;
export const MAX_LIVE_SDP_CHARS = 64 * 1024;
export const MAX_LIVE_INSTRUCTIONS_CHARS = 16_000;
export const MAX_RECORDING_MS = 120_000;
export const VOICE_REQUEST_TIMEOUT_MS = 60_000;
export const LIVE_ICE_TIMEOUT_MS = 10_000;
export const LIVE_CLOSE_TIMEOUT_MS = 15_000;

export const DEFAULT_OPENAI_STT_MODEL = "gpt-4o-mini-transcribe";
export const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
export const DEFAULT_OPENAI_TTS_VOICE = "alloy";
export const DEFAULT_OPENAI_LIVE_MODEL = "gpt-live-1";
export const DEFAULT_OPENAI_LIVE_VOICE = "marin";
export const DEFAULT_GROQ_STT_MODEL = "whisper-large-v3-turbo";
