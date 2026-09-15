import { z } from "zod";
import { SafeError } from "@/utils/error";
import {
  MAX_LIVE_SDP_CHARS,
  MAX_SPEAK_CHARS,
  MAX_TRANSCRIBE_BYTES,
} from "@/utils/voice/limits";

export const transcribeVoiceBody = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1).default("audio/webm"),
});
export type TranscribeVoiceBody = z.infer<typeof transcribeVoiceBody>;

export const speakVoiceBody = z.object({
  text: z.string().trim().min(1).max(MAX_SPEAK_CHARS),
  voiceId: z.string().trim().min(1).optional(),
});
export type SpeakVoiceBody = z.infer<typeof speakVoiceBody>;

export const liveSessionBody = z.object({
  sdp: z.string().trim().min(1).max(MAX_LIVE_SDP_CHARS),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().trim().min(1),
      }),
    )
    .max(20)
    .optional(),
});
export type LiveSessionBody = z.infer<typeof liveSessionBody>;

export function decodeAudioBase64(value: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(value, "base64"));
  } catch {
    throw new SafeError("Recording is not valid audio.", 400);
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_TRANSCRIBE_BYTES) {
    throw new SafeError("That recording is empty or too large.", 400);
  }
  return bytes;
}
