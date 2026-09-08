import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  findOrCreateDeleteRule,
  forgetTrainedSender,
  keepSenderInInbox,
  moveTrainedSender,
} from "./move-trained-sender";
import {
  ActionType,
  GroupItemSource,
  GroupItemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { getOrCreateGroupForRule } from "@/utils/rule/learned-patterns";
import { createRuleWithResolvedActions } from "@/utils/rule/rule";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

vi.mock("@/utils/prisma", () => ({
  default: {
    groupItem: {
      upsert: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    rule: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  getOrCreateGroupForRule: vi.fn().mockResolvedValue("target-group"),
}));

vi.mock("@/utils/rule/rule", () => ({
  createRuleWithResolvedActions: vi
    .fn()
    .mockResolvedValue({ id: "delete-rule" }),
}));

const args = {
  emailAccountId: "email-account-id",
  sender: "sender@example.com",
  logger,
};

const moved = {
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
    await moveTrainedSender({ ...args, ruleId: "rule-new" });

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
      update: moved,
      create: {
        groupId: "target-group",
        type: GroupItemType.FROM,
        value: "sender@example.com",
        ...moved,
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
      moveTrainedSender({ ...args, ruleId: "rule-new" }),
    ).rejects.toThrow("Rule not found");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("forgetTrainedSender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes the sender's inclusions but keeps exclusions", async () => {
    await forgetTrainedSender(args);

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

describe("keepSenderInInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.rule.findMany).mockResolvedValue([
      { id: "rule-a", name: "Later", groupId: "group-a" },
      { id: "rule-b", name: "Receipts", groupId: null },
    ] as any);
  });

  it("drops the sender's training and excludes it from every enabled rule", async () => {
    await keepSenderInInbox(args);

    expect(prisma.groupItem.deleteMany).toHaveBeenCalledWith({
      where: {
        type: GroupItemType.FROM,
        value: "sender@example.com",
        exclude: false,
        group: { emailAccountId: "email-account-id" },
      },
    });
    expect(getOrCreateGroupForRule).toHaveBeenCalledTimes(2);
    expect(prisma.groupItem.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.groupItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          exclude: true,
          reason: "Keep in inbox",
          source: GroupItemSource.USER,
        },
      }),
    );
  });
});

describe("findOrCreateDeleteRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.rule.findUnique).mockResolvedValue(null);
  });

  it("reuses a rule whose only action is delete", async () => {
    vi.mocked(prisma.rule.findMany).mockResolvedValue([
      {
        id: "labels-and-deletes",
        actions: [{ type: ActionType.LABEL }, { type: ActionType.DELETE }],
      },
      { id: "just-deletes", actions: [{ type: ActionType.DELETE }] },
    ] as any);

    await expect(
      findOrCreateDeleteRule({ emailAccountId: "email-account-id", logger }),
    ).resolves.toBe("just-deletes");
    expect(createRuleWithResolvedActions).not.toHaveBeenCalled();
  });

  it("creates the delete rule when there is none", async () => {
    vi.mocked(prisma.rule.findMany).mockResolvedValue([]);

    await expect(
      findOrCreateDeleteRule({ emailAccountId: "email-account-id", logger }),
    ).resolves.toBe("delete-rule");
    expect(createRuleWithResolvedActions).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      data: { name: "Delete", enabled: true, runOnThreads: false },
      actions: [{ type: ActionType.DELETE }],
    });
  });

  it("refuses to shadow an unrelated rule named Delete", async () => {
    vi.mocked(prisma.rule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "other",
    } as any);

    await expect(
      findOrCreateDeleteRule({ emailAccountId: "email-account-id", logger }),
    ).rejects.toThrow('A rule named "Delete" exists');
    expect(createRuleWithResolvedActions).not.toHaveBeenCalled();
  });
});
