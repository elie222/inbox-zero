import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  buildInboxSnapshotMessage,
  buildResolvedSystemPrompt,
  loadFreshRuleContext,
} from "@/utils/ai/assistant/chat";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

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

describe("loadFreshRuleContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockRuleSnapshot({ rulesRevision }: { rulesRevision: number }) {
    prisma.emailAccount.findUnique.mockResolvedValue({
      about: "Prefers short replies",
      rulesRevision,
      rules: [
        {
          name: "Newsletters",
          instructions: "Newsletters and digests",
          updatedAt: new Date("2026-07-01T00:00:00.000Z"),
          from: null,
          to: null,
          subject: null,
          conditionalOperator: "AND",
          enabled: true,
          runOnThreads: true,
          actions: [],
        },
      ],
      messagingChannels: [],
    } as any);
  }

  it("returns null for a brand-new chat that has never seen rules", async () => {
    const result = await loadFreshRuleContext({
      emailAccountId: "account-1",
      chatLastSeenRulesRevision: null,
      chatHasHistory: false,
    });

    expect(result).toBeNull();
    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
  });

  it("hydrates read state without new rule state when the revision is unchanged", async () => {
    mockRuleSnapshot({ rulesRevision: 5 });

    const result = await loadFreshRuleContext({
      emailAccountId: "account-1",
      chatLastSeenRulesRevision: 5,
      chatHasHistory: true,
    });

    expect(result).not.toBeNull();
    expect(result?.hasNewRuleState).toBe(false);
    expect(result?.ruleReadState.rulesRevision).toBe(5);
    expect(result?.ruleReadState.ruleUpdatedAtByName.get("Newsletters")).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("marks new rule state when the revision advanced since the chat last saw it", async () => {
    mockRuleSnapshot({ rulesRevision: 6 });

    const result = await loadFreshRuleContext({
      emailAccountId: "account-1",
      chatLastSeenRulesRevision: 5,
      chatHasHistory: true,
    });

    expect(result?.hasNewRuleState).toBe(true);
    expect(result?.ruleReadState.rulesRevision).toBe(6);
  });

  it("marks new rule state for a chat with history that never saw a revision", async () => {
    mockRuleSnapshot({ rulesRevision: 0 });

    const result = await loadFreshRuleContext({
      emailAccountId: "account-1",
      chatLastSeenRulesRevision: null,
      chatHasHistory: true,
    });

    expect(result?.hasNewRuleState).toBe(true);
  });
});
