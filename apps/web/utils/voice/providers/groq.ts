import type {
  VoiceProvider,
  VoiceTranscribeRequest,
} from "@/utils/voice/types";
import { transcribeOpenAiCompatible } from "@/utils/voice/http";
import { DEFAULT_GROQ_STT_MODEL } from "@/utils/voice/limits";

export class GroqVoiceProvider implements VoiceProvider {
  readonly id = "groq" as const;
  readonly capabilities = {
    transcribe: true,
    synthesize: false,
    live: false,
  };
  private readonly apiKey: string;
  private readonly sttModel?: string;

  constructor(options: { apiKey: string; sttModel?: string }) {
    this.apiKey = options.apiKey;
    this.sttModel = options.sttModel;
  }

  async transcribe(request: VoiceTranscribeRequest): Promise<{ text: string }> {
    return transcribeOpenAiCompatible({
      url: "https://api.groq.com/openai/v1/audio/transcriptions",
      apiKey: this.apiKey,
      model: this.sttModel || DEFAULT_GROQ_STT_MODEL,
      audio: request.audio,
      mimeType: request.mimeType,
      signal: request.signal,
    });
  }
}
