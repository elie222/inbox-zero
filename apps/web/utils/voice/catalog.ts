import type {
  VoiceCatalogEntry,
  VoiceProviderId,
  VoiceStatus,
} from "@/utils/voice/types";

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

export function voiceStatusSummary(
  status: Pick<VoiceStatus, "enabled" | "providerName" | "live" | "synthesize">,
): string {
  if (!status.enabled) {
    return "Add an OpenAI or Groq key to turn on dictation and live voice.";
  }

  const parts = ["dictation"];
  if (status.live) parts.push("live conversations");
  if (status.synthesize) parts.push("spoken replies");

  const name = status.providerName ?? "Voice";
  if (parts.length === 1) return `${name} handles ${parts[0]}.`;
  if (parts.length === 2) {
    return `${name} handles ${parts[0]} and ${parts[1]}.`;
  }
  return `${name} handles ${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}.`;
}
