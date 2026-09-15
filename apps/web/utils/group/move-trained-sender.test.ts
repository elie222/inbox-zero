import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  forgetTrainedSender,
  moveTrainedSender,
  trainSenderToDelete,
} from "./move-trained-sender";
import {
  ActionType,
  GroupItemSource,
  GroupItemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { createRuleWithResolvedActions } from "@/utils/rule/rule";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

vi.mock("@/utils/prisma", () => ({
  default: {
    groupItem: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    rule: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
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

describe("moveTrainedSender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-new",
    } as any);
  });

  it("learns the sender into the target rule as a user inclusion", async () => {
    await moveTrainedSender({ ...args, ruleId: "rule-new" });

    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-id",
        from: "sender@example.com",
        ruleId: "rule-new",
        exclude: false,
        source: GroupItemSource.USER,
      }),
    );
  });

  it("rejects a rule that belongs to another account", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue(null);

    await expect(
      moveTrainedSender({ ...args, ruleId: "rule-new" }),
    ).rejects.toThrow("Rule not found");
    expect(saveLearnedPattern).not.toHaveBeenCalled();
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

describe("trainSenderToDelete", () => {
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
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "just-deletes",
    } as any);

    await trainSenderToDelete(args);

    expect(createRuleWithResolvedActions).not.toHaveBeenCalled();
    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: "just-deletes" }),
    );
  });

  it("creates the delete rule when there is none", async () => {
    vi.mocked(prisma.rule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.rule.findUnique)
      .mockResolvedValueOnce(null) // no rule named Delete
      .mockResolvedValueOnce({ id: "delete-rule" } as any); // moveTrainedSender lookup

    await trainSenderToDelete(args);

    expect(createRuleWithResolvedActions).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      data: { name: "Delete", enabled: true, runOnThreads: false },
      actions: [{ type: ActionType.DELETE }],
    });
    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: "delete-rule" }),
    );
  });

  it("refuses to shadow an unrelated rule named Delete", async () => {
    vi.mocked(prisma.rule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "other",
    } as any);

    await expect(trainSenderToDelete(args)).rejects.toThrow(
      'A rule named "Delete" exists',
    );
    expect(createRuleWithResolvedActions).not.toHaveBeenCalled();
  });
});
