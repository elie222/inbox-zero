import { describe, expect, it } from "vitest";
import { voiceStatusSummary } from "./catalog";

describe("voiceStatusSummary", () => {
  it("asks for a key when voice is off", () => {
    expect(
      voiceStatusSummary({
        enabled: false,
        providerName: null,
        live: false,
        synthesize: false,
      }),
    ).toBe("Add an OpenAI or Groq key to turn on dictation and live voice.");
  });

  it("lists only the capabilities the provider has", () => {
    expect(
      voiceStatusSummary({
        enabled: true,
        providerName: "Groq",
        live: false,
        synthesize: false,
      }),
    ).toBe("Groq handles dictation.");
    expect(
      voiceStatusSummary({
        enabled: true,
        providerName: "OpenAI",
        live: true,
        synthesize: false,
      }),
    ).toBe("OpenAI handles dictation and live conversations.");
    expect(
      voiceStatusSummary({
        enabled: true,
        providerName: "OpenAI",
        live: true,
        synthesize: true,
      }),
    ).toBe("OpenAI handles dictation, live conversations, and spoken replies.");
  });
});
