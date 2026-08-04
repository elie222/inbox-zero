import { describe, expect, it } from "vitest";
import {
  PROMPT_COMMANDS,
  expandPromptCommand,
  getHelpText,
  isHelpCommand,
  isUnsupportedSlashCommand,
} from "./prompt-commands";

const HELP_OPTIONS = {
  baseUrl: "https://example.com/",
  supportEmail: "support@example.com",
};

describe("expandPromptCommand", () => {
  it("maps cleanup command to a concrete inbox prompt", () => {
    expect(expandPromptCommand("/cleanup")).toBe(
      "Help me clean up my inbox today.",
    );
  });

  it("maps command variants that include a bot username suffix", () => {
    expect(expandPromptCommand("/summary@InboxZeroBot")).toBe(
      "Summarize what needs attention in my inbox today.",
    );
  });

  it("does not rewrite non-prompt commands", () => {
    expect(expandPromptCommand("/connect abc123")).toBe("/connect abc123");
  });

  it("keeps regular chat text unchanged", () => {
    expect(expandPromptCommand("what should I work on first?")).toBe(
      "what should I work on first?",
    );
  });
});

describe("isHelpCommand", () => {
  it("returns true for basic help command syntax", () => {
    expect(isHelpCommand("/help")).toBe(true);
  });

  it("returns true for help command with bot username", () => {
    expect(isHelpCommand("/help@InboxZeroBot")).toBe(true);
  });

  it("returns false when additional text is appended", () => {
    expect(isHelpCommand("/help me clean this up")).toBe(false);
  });
});

describe("getHelpText", () => {
  it("includes account setup and the available Teams commands", () => {
    const helpText = getHelpText("teams", HELP_OPTIONS);
    expect(helpText).toContain("Commands:");
    expect(helpText).toContain("Microsoft Teams");
    expect(helpText).toContain("An active Inbox Zero account is required.");
    expect(helpText).toContain("https://example.com/channels");
    expect(helpText).toContain("support@example.com");

    for (const key of Object.keys(PROMPT_COMMANDS)) {
      expect(helpText).toContain(`/${key}`);
    }

    expect(helpText).toContain("/connect <code>");
    expect(helpText).toContain("/switch");
  });

  it("omits account-linking commands that Slack does not support", () => {
    const helpText = getHelpText("slack", HELP_OPTIONS);

    expect(helpText).not.toContain("/connect");
    expect(helpText).not.toContain("/switch");
    expect(helpText).toContain("/help");
  });
});

describe("isUnsupportedSlashCommand", () => {
  it("identifies unknown slash commands", () => {
    expect(isUnsupportedSlashCommand("/unknown")).toBe(true);
    expect(isUnsupportedSlashCommand("/unknown@InboxZeroBot value")).toBe(true);
  });

  it("allows supported commands and regular messages", () => {
    expect(isUnsupportedSlashCommand("/help")).toBe(false);
    expect(isUnsupportedSlashCommand("/connect abc123")).toBe(false);
    expect(isUnsupportedSlashCommand("/summary")).toBe(false);
    expect(isUnsupportedSlashCommand("Hello")).toBe(false);
  });
});
