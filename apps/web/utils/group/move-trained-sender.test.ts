import { vi, describe, it, expect, beforeEach } from "vitest";
import { moveTrainedSender } from "./move-trained-sender";
import { GroupItemSource, GroupItemType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { getOrCreateGroupForRule } from "@/utils/rule/learned-patterns";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

vi.mock("@/utils/prisma", () => ({
  default: {
    groupItem: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    rule: { findUnique: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  getOrCreateGroupForRule: vi.fn().mockResolvedValue("target-group"),
}));

describe("moveTrainedSender", () => {
  const item = {
    id: "item-1",
    type: GroupItemType.FROM,
    value: "sender@example.com",
    group: { rule: { id: "rule-old" } },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.groupItem.findFirst).mockResolvedValue(item as any);
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-new",
      name: "Receipts",
      groupId: null,
    } as any);
  });

  it("adds the sender to the target rule and removes it from the old one", async () => {
    await moveTrainedSender({
      emailAccountId: "email-account-id",
      itemId: "item-1",
      ruleId: "rule-new",
      logger,
    });

    expect(getOrCreateGroupForRule).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: "rule-new", ruleName: "Receipts" }),
    );
    expect(prisma.groupItem.upsert).toHaveBeenCalledWith({
      where: {
        groupId_type_value: {
          groupId: "target-group",
          type: GroupItemType.FROM,
          value: "sender@example.com",
        },
      },
      update: {
        exclude: false,
        reason: "Moved by user",
        source: GroupItemSource.USER,
      },
      create: {
        groupId: "target-group",
        type: GroupItemType.FROM,
        value: "sender@example.com",
        exclude: false,
        reason: "Moved by user",
        source: GroupItemSource.USER,
      },
    });
    expect(prisma.groupItem.delete).toHaveBeenCalledWith({
      where: { id: "item-1" },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("does nothing when the sender is already on that rule", async () => {
    await moveTrainedSender({
      emailAccountId: "email-account-id",
      itemId: "item-1",
      ruleId: "rule-old",
      logger,
    });

    expect(prisma.rule.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a sender that belongs to another account", async () => {
    vi.mocked(prisma.groupItem.findFirst).mockResolvedValue(null);

    await expect(
      moveTrainedSender({
        emailAccountId: "email-account-id",
        itemId: "item-1",
        ruleId: "rule-new",
        logger,
      }),
    ).rejects.toThrow("Trained sender not found");
  });

  it("rejects a rule that belongs to another account", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue(null);

    await expect(
      moveTrainedSender({
        emailAccountId: "email-account-id",
        itemId: "item-1",
        ruleId: "rule-new",
        logger,
      }),
    ).rejects.toThrow("Rule not found");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
