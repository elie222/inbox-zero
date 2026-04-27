import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { createRuleHistory } from "./rule-history";
import type { RuleWithRelations } from "./types";

vi.mock("@/utils/prisma");

function sampleRule(
  overrides: Partial<RuleWithRelations> = {},
): RuleWithRelations {
  return {
    id: "rule-1",
    name: "Newsletters",
    instructions: "Match recurring mail",
    enabled: true,
    automate: true,
    runOnThreads: false,
    conditionalOperator: "AND",
    from: "news@example.com",
    to: null,
    subject: null,
    body: null,
    systemType: null,
    promptText: null,
    actions: [
      {
        id: "action-1",
        type: ActionType.NOTIFY_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890123",
        messagingChannelEmailAccountId: "acct-1",
        label: null,
        labelId: null,
        subject: null,
        content: "Hello",
        to: null,
        cc: null,
        bcc: null,
        url: null,
        folderName: null,
        folderId: null,
        delayInMinutes: null,
        staticAttachments: [{ name: "a.txt", url: "https://x/a" }],
      },
    ],
    group: null,
    ...overrides,
  } as RuleWithRelations;
}

describe("createRuleHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts at version 1 when there is no prior history", async () => {
    vi.mocked(prisma.ruleHistory.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.ruleHistory.create).mockResolvedValue({} as any);

    const rule = sampleRule();

    await createRuleHistory({ rule, triggerType: "updated" });

    expect(prisma.ruleHistory.findFirst).toHaveBeenCalledWith({
      where: { ruleId: "rule-1" },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    expect(prisma.ruleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ruleId: "rule-1",
          version: 1,
          triggerType: "updated",
          name: rule.name,
          instructions: rule.instructions,
          actions: [
            expect.objectContaining({
              id: "action-1",
              type: ActionType.NOTIFY_MESSAGING_CHANNEL,
              messagingChannelId: "cmessagingchannel1234567890123",
              messagingChannelEmailAccountId: "acct-1",
              content: "Hello",
              staticAttachments: [{ name: "a.txt", url: "https://x/a" }],
            }),
          ],
        }),
      }),
    );
  });

  it("increments version from the latest history row", async () => {
    vi.mocked(prisma.ruleHistory.findFirst).mockResolvedValue({
      version: 4,
    } as any);
    vi.mocked(prisma.ruleHistory.create).mockResolvedValue({} as any);

    await createRuleHistory({
      rule: sampleRule(),
      triggerType: "actions_updated",
    });

    expect(prisma.ruleHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 5 }),
      }),
    );
  });
});
