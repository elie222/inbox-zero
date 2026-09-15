import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIVoiceProvider } from "./openai";
import { GroqVoiceProvider } from "./groq";

const fetchMock = vi.fn();

describe("voice providers", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("transcribes through OpenAI's transcriptions API", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "hello there" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new OpenAIVoiceProvider({ apiKey: "sk-test" });
    await expect(
      provider.transcribe({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: "audio/webm",
      }),
    ).resolves.toEqual({ text: "hello there" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates a GPT-Live WebRTC session without exposing the API key", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          session: { id: "live_123" },
          transport: { type: "webrtc", sdp: "v=0" },
        }),
        { status: 201 },
      ),
    );
    const provider = new OpenAIVoiceProvider({ apiKey: "sk-test" });
    await expect(
      provider.createLiveSession({
        sdp: "offer",
        instructions: "Be concise.",
        history: [{ role: "user", text: "hello" }],
      }),
    ).resolves.toEqual({ sessionId: "live_123", sdp: "v=0" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.session.model).toBe("gpt-live-1");
    expect(body.transport).toEqual({ type: "webrtc", sdp: "offer" });
    expect(body.session.input[0].content[0].text).toBe("hello");
  });

  it("transcribes through Groq without advertising live or TTS", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "hello" }), { status: 200 }),
    );
    const provider = new GroqVoiceProvider({ apiKey: "gsk-test" });
    expect(provider.capabilities).toEqual({
      transcribe: true,
      synthesize: false,
      live: false,
    });
    await provider.transcribe({
      audio: new Uint8Array([1]),
      mimeType: "audio/webm",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      expect.anything(),
    );
  });
});
