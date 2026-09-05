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

  it.each([
    "",
    "   ",
  ])("uses the documented default for blank Microsoft tenant %j", async (tenant) => {
    process.env.DEFAULT_LLMS = "openai:gpt-5.4-mini";
    process.env.MICROSOFT_TENANT_ID = tenant;
    const { env } = await import("./env");
    expect(env.MICROSOFT_TENANT_ID).toBe("common");
  });

  it("accepts a configured unsubscribe credit limit from the environment", async () => {
    process.env.DEFAULT_LLMS = "openai:gpt-5.4-mini";
    process.env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS = "10";
    const { env } = await import("./env");
    expect(env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS).toBe(10);
  });

  it.each([
    undefined,
    "",
    "   ",
  ])("defaults a blank or unset credit limit %j", async (value) => {
    process.env.DEFAULT_LLMS = "openai:gpt-5.4-mini";
    if (value === undefined)
      delete process.env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS;
    else process.env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS = value;
    const { env } = await import("./env");
    expect(env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS).toBe(5);
  });

  it.each([
    "-1",
    "5.5",
    "abc",
  ])("rejects an invalid credit limit %j", async (value) => {
    process.env.DEFAULT_LLMS = "openai:gpt-5.4-mini";
    process.env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS = value;
    await expect(import("./env")).rejects.toThrow(
      "Invalid environment variables",
    );
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
