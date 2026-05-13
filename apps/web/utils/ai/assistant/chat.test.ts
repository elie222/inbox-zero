import { describe, expect, it, vi } from "vitest";
import {
  buildInboxSnapshotMessage,
  buildResolvedSystemPrompt,
} from "@/utils/ai/assistant/chat";

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

describe("buildInboxSnapshotMessage", () => {
  it("frames the inbox snapshot as a starting point and not the live state", () => {
    const message = buildInboxSnapshotMessage({ total: 240, unread: 6 });

    expect(message).not.toBeNull();
    expect(message?.content).toContain("240");
    expect(message?.content).toContain("6");
    expect(message?.content).toMatch(/searchInbox/);
    expect(message?.content).toMatch(/stale|out of date|may have changed/i);
  });

  it("returns null when no inboxStats are available", () => {
    expect(buildInboxSnapshotMessage(null)).toBeNull();
    expect(buildInboxSnapshotMessage(undefined)).toBeNull();
  });
});
