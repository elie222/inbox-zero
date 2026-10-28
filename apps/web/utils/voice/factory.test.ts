import { describe, expect, it } from "vitest";
import {
  createVoiceProvider,
  requireVoiceCapability,
  resolveVoiceRuntime,
  toVoiceStatus,
} from "./factory";
import { VoiceUnavailableError } from "./errors";
import { Provider } from "@/utils/llms/config";

describe("resolveVoiceRuntime", () => {
  it("uses OpenAI when a deployment key is present", () => {
    const config = resolveVoiceRuntime({
      env: { OPENAI_API_KEY: "sk-test" },
    });
    expect(config).toMatchObject({
      enabled: true,
      providerId: "openai",
      openaiApiKey: "sk-test",
    });
    expect(toVoiceStatus(config)).toMatchObject({
      enabled: true,
      provider: "openai",
      transcribe: true,
      synthesize: true,
      live: true,
    });
  });

  it("falls back to Groq when OpenAI is not configured", () => {
    const config = resolveVoiceRuntime({
      env: { GROQ_API_KEY: "gsk-test" },
    });
    expect(toVoiceStatus(config)).toMatchObject({
      enabled: true,
      provider: "groq",
      transcribe: true,
      synthesize: false,
      live: false,
    });
  });

  it("honors an explicit provider even if another key exists", () => {
    const config = resolveVoiceRuntime({
      env: {
        VOICE_PROVIDER: "groq",
        OPENAI_API_KEY: "sk-test",
        GROQ_API_KEY: "gsk-test",
      },
    });
    expect(config.providerId).toBe("groq");
    expect(toVoiceStatus(config).live).toBe(false);
  });

  it("prefers a user's OpenAI BYOK key over the deployment key", () => {
    const config = resolveVoiceRuntime({
      env: { OPENAI_API_KEY: "sk-deploy" },
      userAi: {
        aiProvider: Provider.OPEN_AI,
        aiModel: "gpt-5.4-mini",
        aiApiKey: "sk-user",
      },
    });
    expect(config.openaiApiKey).toBe("sk-user");
  });

  it("does not use a non-OpenAI user key as the voice credential", () => {
    const config = resolveVoiceRuntime({
      env: { OPENAI_API_KEY: "sk-deploy" },
      userAi: {
        aiProvider: Provider.ANTHROPIC,
        aiModel: "claude",
        aiApiKey: "sk-anth",
      },
    });
    expect(config.openaiApiKey).toBe("sk-deploy");
  });

  it("disables voice when the public flag is false", () => {
    const config = resolveVoiceRuntime({
      env: {
        NEXT_PUBLIC_VOICE_ENABLED: false,
        OPENAI_API_KEY: "sk-test",
      },
    });
    expect(toVoiceStatus(config).enabled).toBe(false);
  });

  it("is disabled when the requested provider has no key", () => {
    const config = resolveVoiceRuntime({
      env: { VOICE_PROVIDER: "openai", GROQ_API_KEY: "gsk-test" },
    });
    expect(config.enabled).toBe(false);
    expect(config.providerId).toBeNull();
  });

  it("is disabled when no voice keys are configured", () => {
    const config = resolveVoiceRuntime({ env: {} });
    expect(toVoiceStatus(config).enabled).toBe(false);
  });

  it("creates the selected provider adapter", () => {
    const openai = createVoiceProvider(
      resolveVoiceRuntime({ env: { OPENAI_API_KEY: "sk-test" } }),
    );
    expect(openai.id).toBe("openai");
    expect(openai.capabilities.live).toBe(true);

    const groq = createVoiceProvider(
      resolveVoiceRuntime({ env: { GROQ_API_KEY: "gsk-test" } }),
    );
    expect(groq.id).toBe("groq");
    expect(groq.capabilities.live).toBe(false);
  });

  it("refuses to create a provider when voice is disabled", () => {
    expect(() => createVoiceProvider(resolveVoiceRuntime({ env: {} }))).toThrow(
      VoiceUnavailableError,
    );
  });

  it("requires live via createLiveSession, not a live() method", () => {
    const openai = createVoiceProvider(
      resolveVoiceRuntime({ env: { OPENAI_API_KEY: "sk-test" } }),
    );
    expect(() => requireVoiceCapability(openai, "live")).not.toThrow();
    expect(() => requireVoiceCapability(openai, "transcribe")).not.toThrow();

    const groq = createVoiceProvider(
      resolveVoiceRuntime({ env: { GROQ_API_KEY: "gsk-test" } }),
    );
    expect(() => requireVoiceCapability(groq, "live")).toThrow(
      VoiceUnavailableError,
    );
    expect(() => requireVoiceCapability(groq, "synthesize")).toThrow(
      VoiceUnavailableError,
    );
  });
});
