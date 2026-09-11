import { describe, expect, it } from "vitest";
import { buildLegacyLlmsEnv } from "./env-legacy-llms";

describe("buildLegacyLlmsEnv", () => {
  it("converts legacy default model and fallbacks into DEFAULT_LLMS", () => {
    const result = buildLegacyLlmsEnv({
      DEFAULT_LLM_PROVIDER: "openai",
      DEFAULT_LLM_MODEL: "gpt-5.4-mini",
      DEFAULT_LLM_FALLBACKS:
        " openrouter:anthropic/claude-sonnet-4.6 , bedrock:global.anthropic.claude-haiku-4-5-20251001-v1:0 ",
    });

    expect(result.DEFAULT_LLMS).toBe(
      "openai:gpt-5.4-mini,openrouter:anthropic/claude-sonnet-4.6,bedrock:global.anthropic.claude-haiku-4-5-20251001-v1:0",
    );
  });

  it("uses the same provider defaults as the legacy default resolver", () => {
    expect(
      buildLegacyLlmsEnv({ DEFAULT_LLM_PROVIDER: "openai" }).DEFAULT_LLMS,
    ).toBe("openai:gpt-5.4-mini");
    expect(
      buildLegacyLlmsEnv({ DEFAULT_LLM_PROVIDER: "openrouter" }).DEFAULT_LLMS,
    ).toBe("openrouter:anthropic/claude-sonnet-4.6");
    expect(
      buildLegacyLlmsEnv({
        DEFAULT_LLM_PROVIDER: "ollama",
        OLLAMA_MODEL: "qwen3.5:4b",
      }).DEFAULT_LLMS,
    ).toBe("ollama:qwen3.5:4b");
    expect(
      buildLegacyLlmsEnv({
        DEFAULT_LLM_PROVIDER: "openai-compatible",
        OPENAI_COMPATIBLE_MODEL: "local:model",
      }).DEFAULT_LLMS,
    ).toBe("openai-compatible:local:model");
  });

  it("converts role primary models with the same fallback inheritance as legacy resolver", () => {
    const result = buildLegacyLlmsEnv({
      DEFAULT_LLM_PROVIDER: "openai",
      DEFAULT_LLM_MODEL: "gpt-5.4-mini",
      DEFAULT_LLM_FALLBACKS: "openrouter:anthropic/claude-sonnet-4.6",
      ECONOMY_LLM_PROVIDER: "google",
      ECONOMY_LLM_MODEL: "gemini-2.5-flash",
      ECONOMY_LLM_FALLBACKS: "openrouter:google/gemini-2.5-flash",
      CHAT_LLM_PROVIDER: "openrouter",
      CHAT_LLM_MODEL: "anthropic/claude-haiku-4.5",
      NANO_LLM_PROVIDER: "openai",
      NANO_LLM_MODEL: "gpt-5.4-nano",
      DRAFT_LLM_PROVIDER: "anthropic",
      DRAFT_LLM_MODEL: "claude-sonnet-4-6",
    });

    expect(result.ECONOMY_LLMS).toBe(
      "google:gemini-2.5-flash,openrouter:google/gemini-2.5-flash",
    );
    expect(result.CHAT_LLMS).toBe(
      "openrouter:anthropic/claude-haiku-4.5,openrouter:anthropic/claude-sonnet-4.6",
    );
    expect(result.NANO_LLMS).toBe(
      "openai:gpt-5.4-nano,openrouter:google/gemini-2.5-flash",
    );
    expect(result.DRAFT_LLMS).toBe(
      "anthropic:claude-sonnet-4-6,openrouter:anthropic/claude-sonnet-4.6",
    );
  });

  it("keeps role fallback chains when economy or chat legacy primary is absent", () => {
    const result = buildLegacyLlmsEnv({
      DEFAULT_LLM_PROVIDER: "openai",
      DEFAULT_LLM_MODEL: "gpt-5.4-mini",
      ECONOMY_LLM_FALLBACKS: "openrouter:google/gemini-2.5-flash",
      CHAT_LLM_FALLBACKS: "anthropic:claude-haiku-4-5-20251001",
    });

    expect(result.ECONOMY_LLMS).toBe(
      "openai:gpt-5.4-mini,openrouter:google/gemini-2.5-flash",
    );
    expect(result.CHAT_LLMS).toBe(
      "openai:gpt-5.4-mini,anthropic:claude-haiku-4-5-20251001",
    );
  });

  it("does not synthesize nano or draft lists when their legacy primary is absent", () => {
    const result = buildLegacyLlmsEnv({
      DEFAULT_LLM_PROVIDER: "openai",
      DEFAULT_LLM_MODEL: "gpt-5.4-mini",
      DEFAULT_LLM_FALLBACKS: "openrouter:anthropic/claude-sonnet-4.6",
      ECONOMY_LLM_FALLBACKS: "openrouter:google/gemini-2.5-flash",
    });

    expect(result.NANO_LLMS).toBeUndefined();
    expect(result.DRAFT_LLMS).toBeUndefined();
  });

  it("does not use provider default models for role-specific primaries", () => {
    const result = buildLegacyLlmsEnv({
      DEFAULT_LLM_PROVIDER: "openai",
      DEFAULT_LLM_MODEL: "gpt-5.4-mini",
      ECONOMY_LLM_PROVIDER: "openai",
      CHAT_LLM_PROVIDER: "openrouter",
      NANO_LLM_PROVIDER: "openai",
      DRAFT_LLM_PROVIDER: "anthropic",
    });

    expect(result.ECONOMY_LLMS).toBeUndefined();
    expect(result.CHAT_LLMS).toBeUndefined();
    expect(result.NANO_LLMS).toBeUndefined();
    expect(result.DRAFT_LLMS).toBeUndefined();
  });
});
