import type {
  SpeechClip,
  VoiceLiveSession,
  VoiceLiveSessionRequest,
  VoiceProvider,
  VoiceSynthesizeRequest,
  VoiceTranscribeRequest,
} from "@/utils/voice/types";
import { VoiceRequestError } from "@/utils/voice/errors";
import {
  extractErrorMessage,
  postJson,
  transcribeOpenAiCompatible,
  voiceDeadline,
} from "@/utils/voice/http";
import {
  DEFAULT_OPENAI_LIVE_MODEL,
  DEFAULT_OPENAI_LIVE_VOICE,
  DEFAULT_OPENAI_STT_MODEL,
  DEFAULT_OPENAI_TTS_MODEL,
} from "@/utils/voice/limits";

const OPENAI_API = "https://api.openai.com/v1";

export class OpenAIVoiceProvider implements VoiceProvider {
  readonly id = "openai" as const;
  readonly capabilities = {
    transcribe: true,
    synthesize: true,
    live: true,
  };
  private readonly apiKey: string;
  private readonly sttModel?: string;
  private readonly ttsModel?: string;
  private readonly liveModel?: string;
  private readonly liveVoice?: string;

  constructor(options: {
    apiKey: string;
    sttModel?: string;
    ttsModel?: string;
    liveModel?: string;
    liveVoice?: string;
  }) {
    this.apiKey = options.apiKey;
    this.sttModel = options.sttModel;
    this.ttsModel = options.ttsModel;
    this.liveModel = options.liveModel;
    this.liveVoice = options.liveVoice;
  }

  async transcribe(request: VoiceTranscribeRequest): Promise<{ text: string }> {
    return transcribeOpenAiCompatible({
      url: `${OPENAI_API}/audio/transcriptions`,
      apiKey: this.apiKey,
      model: this.sttModel || DEFAULT_OPENAI_STT_MODEL,
      audio: request.audio,
      mimeType: request.mimeType,
      signal: request.signal,
    });
  }

  async synthesize(request: VoiceSynthesizeRequest): Promise<SpeechClip> {
    const signal = voiceDeadline(request.signal);
    const response = await fetch(`${OPENAI_API}/audio/speech`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.ttsModel || DEFAULT_OPENAI_TTS_MODEL,
        voice: request.voiceId,
        input: request.text,
        response_format: "mp3",
      }),
      signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new VoiceRequestError(
        extractErrorMessage(safeJson(body)) ||
          `OpenAI failed while speaking (${response.status})`,
        response.status,
      );
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType: "audio/mpeg",
    };
  }

  async createLiveSession(
    request: VoiceLiveSessionRequest,
  ): Promise<VoiceLiveSession> {
    const { status, body } = await postJson({
      url: `${OPENAI_API}/live/sessions`,
      apiKey: this.apiKey,
      signal: request.signal,
      body: {
        session: {
          model: this.liveModel || DEFAULT_OPENAI_LIVE_MODEL,
          instructions: request.instructions,
          audio: {
            output: {
              voice:
                request.voiceId || this.liveVoice || DEFAULT_OPENAI_LIVE_VOICE,
            },
          },
          input: (request.history ?? []).map((message) => ({
            type: "message",
            role: message.role,
            content: [
              {
                type: message.role === "user" ? "input_text" : "output_text",
                text: message.text,
              },
            ],
          })),
        },
        transport: {
          type: "webrtc",
          sdp: request.sdp,
        },
      },
    });

    if (status < 200 || status >= 300) {
      throw new VoiceRequestError(
        extractErrorMessage(body) ||
          `OpenAI failed while starting a live session (${status})`,
        status >= 400 && status < 600 ? status : 502,
      );
    }

    const session = body as {
      session?: { id?: unknown };
      transport?: { sdp?: unknown };
    } | null;
    const sessionId = String(session?.session?.id ?? "").trim();
    const sdp = String(session?.transport?.sdp ?? "").trim();
    if (!sessionId || !sdp) {
      throw new VoiceRequestError(
        "OpenAI did not return a live session SDP answer.",
        502,
      );
    }
    return { sessionId, sdp };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 200) };
  }
}
