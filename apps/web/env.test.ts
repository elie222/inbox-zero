import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

const llmEnvKeys = [
  "DEFAULT_LLMS",
  "ECONOMY_LLMS",
  "CHAT_LLMS",
  "NANO_LLMS",
  "DRAFT_LLMS",
  "DEFAULT_LLM_PROVIDER",
  "DEFAULT_LLM_MODEL",
  "DEFAULT_LLM_FALLBACKS",
  "ECONOMY_LLM_PROVIDER",
  "ECONOMY_LLM_MODEL",
  "ECONOMY_LLM_FALLBACKS",
  "CHAT_LLM_PROVIDER",
  "CHAT_LLM_MODEL",
  "CHAT_LLM_FALLBACKS",
  "NANO_LLM_PROVIDER",
  "NANO_LLM_MODEL",
  "DRAFT_LLM_PROVIDER",
  "DRAFT_LLM_MODEL",
] as const;

describe("env LLM compatibility conversion", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of llmEnvKeys) delete process.env[key];
  });

  afterEach(() => {
    vi.resetModules();
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it("converts legacy default model and fallbacks into DEFAULT_LLMS", async () => {
    process.env.DEFAULT_LLM_PROVIDER = "openai";
    process.env.DEFAULT_LLM_MODEL = "gpt-5.4-mini";
    process.env.DEFAULT_LLM_FALLBACKS =
      "openrouter:anthropic/claude-sonnet-4.6,bedrock:global.anthropic.claude-haiku-4-5-20251001-v1:0";

    const { env } = await import("./env");

    expect(env.DEFAULT_LLMS).toBe(
      "openai:gpt-5.4-mini,openrouter:anthropic/claude-sonnet-4.6,bedrock:global.anthropic.claude-haiku-4-5-20251001-v1:0",
    );
  });

  it("converts legacy role models into their role-specific LLMS value", async () => {
    process.env.DEFAULT_LLM_PROVIDER = "openai";
    process.env.DEFAULT_LLM_MODEL = "gpt-5.4-mini";
    process.env.ECONOMY_LLM_PROVIDER = "openrouter";
    process.env.ECONOMY_LLM_MODEL = "google/gemini-2.5-flash";
    process.env.ECONOMY_LLM_FALLBACKS = "openai:gpt-5.4-nano";

    const { env } = await import("./env");

    expect(env.DEFAULT_LLMS).toBe("openai:gpt-5.4-mini");
    expect(env.ECONOMY_LLMS).toBe(
      "openrouter:google/gemini-2.5-flash,openai:gpt-5.4-nano",
    );
  });

  it("keeps plural LLMS values ahead of deprecated fields", async () => {
    process.env.DEFAULT_LLMS = "anthropic:claude-sonnet-4-6";
    process.env.DEFAULT_LLM_PROVIDER = "openai";
    process.env.DEFAULT_LLM_MODEL = "gpt-5.4-mini";

    const { env } = await import("./env");

    expect(env.DEFAULT_LLMS).toBe("anthropic:claude-sonnet-4-6");
  });
});
