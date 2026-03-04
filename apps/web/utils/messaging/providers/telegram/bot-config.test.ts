import { describe, expect, it, vi } from "vitest";
import {
  expandTelegramPromptCommand,
  getTelegramHelpText,
  isTelegramHelpCommand,
} from "./bot-config";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    TELEGRAM_BOT_TOKEN: undefined,
    TELEGRAM_BOT_PROFILE_PHOTO_URL: undefined,
    NEXT_PUBLIC_AXIOM_TOKEN: undefined,
    NEXT_PUBLIC_LOG_SCOPES: undefined,
    ENABLE_DEBUG_LOGS: false,
    NODE_ENV: "test",
  },
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

describe("expandTelegramPromptCommand", () => {
  it("maps cleanup command to a concrete inbox prompt", () => {
    expect(expandTelegramPromptCommand("/cleanup")).toBe(
      "Help me clean up my inbox today.",
    );
  });

  it("maps command variants that include a bot username suffix", () => {
    expect(expandTelegramPromptCommand("/summary@InboxZeroBot")).toBe(
      "Summarize what needs attention in my inbox today.",
    );
  });

  it("does not rewrite non-prompt commands", () => {
    expect(expandTelegramPromptCommand("/connect abc123")).toBe(
      "/connect abc123",
    );
  });

  it("keeps regular chat text unchanged", () => {
    expect(expandTelegramPromptCommand("what should I work on first?")).toBe(
      "what should I work on first?",
    );
  });
});

describe("isTelegramHelpCommand", () => {
  it("returns true for basic help command syntax", () => {
    expect(isTelegramHelpCommand("/help")).toBe(true);
  });

  it("returns true for help command with bot username", () => {
    expect(isTelegramHelpCommand("/help@InboxZeroBot")).toBe(true);
  });

  it("returns false when additional text is appended", () => {
    expect(isTelegramHelpCommand("/help me clean this up")).toBe(false);
  });
});

describe("getTelegramHelpText", () => {
  it("includes the cleanup prompt shortcut", () => {
    expect(getTelegramHelpText()).toContain(
      "/cleanup - Help me clean up my inbox today",
    );
  });
});
