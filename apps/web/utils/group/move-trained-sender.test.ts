import { vi, describe, it, expect, beforeEach } from "vitest";
import { forgetTrainedSender, moveTrainedSender } from "./move-trained-sender";
import { GroupItemSource, GroupItemType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { getOrCreateGroupForRule } from "@/utils/rule/learned-patterns";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

vi.mock("@/utils/prisma", () => ({
  default: {
    groupItem: {
      upsert: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    rule: { findUnique: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  getOrCreateGroupForRule: vi.fn().mockResolvedValue("target-group"),
}));

const pattern = {
  exclude: false,
  reason: "Moved by user",
  source: GroupItemSource.USER,
};

describe("moveTrainedSender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-new",
      name: "Receipts",
      groupId: null,
    } as any);
  });

  it("adds the sender to the target rule and removes it from the others", async () => {
    await moveTrainedSender({
      emailAccountId: "email-account-id",
      sender: "sender@example.com",
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
      update: pattern,
      create: {
        groupId: "target-group",
        type: GroupItemType.FROM,
        value: "sender@example.com",
        ...pattern,
      },
    });
    expect(prisma.groupItem.deleteMany).toHaveBeenCalledWith({
      where: {
        type: GroupItemType.FROM,
        value: "sender@example.com",
        exclude: false,
        groupId: { not: "target-group" },
        group: { emailAccountId: "email-account-id" },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("rejects a rule that belongs to another account", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue(null);

    await expect(
      moveTrainedSender({
        emailAccountId: "email-account-id",
        sender: "sender@example.com",
        ruleId: "rule-new",
        logger,
      }),
    ).rejects.toThrow("Rule not found");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("forgetTrainedSender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes the sender's inclusions but keeps exclusions", async () => {
    await forgetTrainedSender({
      emailAccountId: "email-account-id",
      sender: "sender@example.com",
      logger,
    });

    expect(prisma.groupItem.deleteMany).toHaveBeenCalledWith({
      where: {
        type: GroupItemType.FROM,
        value: "sender@example.com",
        exclude: false,
        group: { emailAccountId: "email-account-id" },
      },
    });
  });
});
