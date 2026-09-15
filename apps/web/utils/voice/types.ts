export const VoiceProviderId = {
  OPENAI: "openai",
  GROQ: "groq",
} as const;

export type VoiceProviderId =
  (typeof VoiceProviderId)[keyof typeof VoiceProviderId];

export type VoiceCapabilities = {
  transcribe: boolean;
  synthesize: boolean;
  live: boolean;
};

export type VoiceCatalogEntry = {
  id: VoiceProviderId;
  name: string;
  description: string;
  capabilities: VoiceCapabilities;
};

export type VoiceTranscribeRequest = {
  audio: Uint8Array;
  mimeType: string;
  signal?: AbortSignal;
};

export type SpeechClip = {
  bytes: Uint8Array;
  mimeType: string;
};

export type VoiceSynthesizeRequest = {
  text: string;
  voiceId: string;
  signal?: AbortSignal;
};

export type LiveHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type VoiceLiveSessionRequest = {
  sdp: string;
  instructions: string;
  voiceId?: string;
  history?: LiveHistoryMessage[];
  signal?: AbortSignal;
};

export type VoiceLiveSession = {
  sessionId: string;
  sdp: string;
};

export type VoiceProvider = {
  id: VoiceProviderId;
  capabilities: VoiceCapabilities;
  transcribe?(request: VoiceTranscribeRequest): Promise<{ text: string }>;
  synthesize?(request: VoiceSynthesizeRequest): Promise<SpeechClip>;
  createLiveSession?(
    request: VoiceLiveSessionRequest,
  ): Promise<VoiceLiveSession>;
};

export type VoiceRuntimeConfig = {
  enabled: boolean;
  providerId: VoiceProviderId | null;
  openaiApiKey?: string;
  groqApiKey?: string;
  sttModel?: string;
  ttsModel?: string;
  ttsVoice?: string;
  liveModel?: string;
  liveVoice?: string;
};

export type VoiceStatus = {
  enabled: boolean;
  provider: VoiceProviderId | null;
  providerName: string | null;
  transcribe: boolean;
  synthesize: boolean;
  live: boolean;
  ttsVoice: string | null;
  liveVoice: string | null;
};
