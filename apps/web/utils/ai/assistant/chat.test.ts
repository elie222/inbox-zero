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
});
