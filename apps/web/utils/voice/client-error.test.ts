import { describe, expect, it, vi } from "vitest";
import { clientVoiceApiError, clientVoiceError } from "./client-error";

vi.mock("@/utils/logger-client", () => ({
  createClientLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
    flush: vi.fn(),
  }),
}));

describe("clientVoiceApiError", () => {
  it("keeps a non-empty server error string", () => {
    expect(
      clientVoiceApiError(
        { error: "Voice is rate limited. Try again in a moment." },
        "Could not transcribe that recording.",
      ),
    ).toBe("Voice is rate limited. Try again in a moment.");
  });

  it("falls back when the server error is missing", () => {
    expect(
      clientVoiceApiError({}, "Could not transcribe that recording."),
    ).toBe("Could not transcribe that recording.");
  });
});

describe("clientVoiceError", () => {
  it("returns the fallback instead of the original message", () => {
    expect(
      clientVoiceError(
        new Error(
          "NotAllowedError: Permission denied by https://api.openai.com",
        ),
        "Microphone access was blocked.",
      ),
    ).toBe("Microphone access was blocked.");
  });
});
