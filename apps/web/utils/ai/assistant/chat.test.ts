import { describe, expect, it, vi } from "vitest";
import { buildResolvedSystemPrompt } from "@/utils/ai/assistant/chat";

vi.mock("server-only", () => ({}));

describe("buildResolvedSystemPrompt", () => {
  it("uses Outlook category wording instead of label wording", () => {
    const prompt = buildResolvedSystemPrompt({
      emailSendToolsEnabled: true,
      draftReplyActionsEnabled: true,
      webhookActionsEnabled: true,
      provider: "microsoft",
      responseSurface: "web",
      userTimezone: "UTC",
      currentTimestamp: "2026-05-12T00:00:00.000Z",
    });

    expect(prompt).toContain("category");
    expect(prompt).not.toMatch(/\blabels?\b/i);
  });

  it("includes the user's writing style when configured", () => {
    const writingStyle =
      "Formality: very formal, polished. Often opens with 'I trust this message finds you well.'";

    const prompt = buildResolvedSystemPrompt({
      emailSendToolsEnabled: true,
      draftReplyActionsEnabled: true,
      webhookActionsEnabled: true,
      provider: "google",
      responseSurface: "web",
      userTimezone: "UTC",
      currentTimestamp: "2026-05-12T00:00:00.000Z",
      writingStyle,
    });

    expect(prompt).toContain("<writing_style>");
    expect(prompt).toContain(writingStyle);
    expect(prompt).toContain("</writing_style>");
  });

  it("omits writing style block when no writing style is configured", () => {
    const prompt = buildResolvedSystemPrompt({
      emailSendToolsEnabled: true,
      draftReplyActionsEnabled: true,
      webhookActionsEnabled: true,
      provider: "google",
      responseSurface: "web",
      userTimezone: "UTC",
      currentTimestamp: "2026-05-12T00:00:00.000Z",
      writingStyle: null,
    });

    expect(prompt).not.toContain("<writing_style>");
  });
});
