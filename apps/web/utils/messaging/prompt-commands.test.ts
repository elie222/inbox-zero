import { describe, expect, it } from "vitest";
import {
  PROMPT_COMMANDS,
  expandPromptCommand,
  getHelpText,
  isHelpCommand,
} from "./prompt-commands";

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
  it("includes the available slash commands", () => {
    const helpText = getHelpText("slack");
    expect(helpText).toContain("Commands:");

    for (const key of Object.keys(PROMPT_COMMANDS)) {
      expect(helpText).toContain(`/${key}`);
    }

    expect(helpText).toContain("/connect <code>");
    expect(helpText).toContain("/switch");
  });
});
