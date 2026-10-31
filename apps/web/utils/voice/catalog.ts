import type { VoiceCatalogEntry, VoiceProviderId } from "@/utils/voice/types";

export const VOICE_CATALOG: VoiceCatalogEntry[] = [
  {
    id: "openai",
    name: "OpenAI",
    description:
      "Dictation, spoken replies, and GPT-Live full-duplex conversations.",
    capabilities: { transcribe: true, synthesize: true, live: true },
  },
  {
    id: "groq",
    name: "Groq",
    description:
      "Fast Whisper-class dictation. Does not speak or run live calls.",
    capabilities: { transcribe: true, synthesize: false, live: false },
  },
];

export function voiceCatalogEntry(
  id: string | null | undefined,
): VoiceCatalogEntry | undefined {
  return VOICE_CATALOG.find((entry) => entry.id === id);
}

export function isVoiceProviderId(value: string): value is VoiceProviderId {
  return VOICE_CATALOG.some((entry) => entry.id === value);
}
