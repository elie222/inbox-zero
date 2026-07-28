import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveLearnedPattern, saveLearnedPatterns } from "./learned-patterns";
import prisma from "@/utils/__mocks__/prisma";
import { GroupItemType, GroupItemSource } from "@/generated/prisma/enums";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/prisma");

vi.mock("@/utils/prisma-helpers", () => ({
  isDuplicateError: vi.fn(),
}));

describe("saveLearnedPattern", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.groupItem.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.groupItem.create).mockResolvedValue({} as any);
    vi.mocked(isDuplicateError).mockReturnValue(false);
  });

  it("should return early if rule not found", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue(null);

    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "test@example.com",
      ruleId: "nonexistent-rule",
      logger: createTestLogger(),
    });

    expect(prisma.groupItem.updateMany).not.toHaveBeenCalled();
    expect(prisma.groupItem.create).not.toHaveBeenCalled();
  });

  it("should use existing groupId when rule has one", async () => {
    const existingGroupId = "existing-group-id";
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      name: "Test Rule",
      groupId: existingGroupId,
    } as any);
    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "test@example.com",
      ruleId: "rule-id",
      logger: createTestLogger(),
    });

    expect(prisma.group.create).not.toHaveBeenCalled();
    expect(prisma.groupItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: existingGroupId,
        type: GroupItemType.FROM,
        value: "test@example.com",
        exclude: false,
      }),
    });
  });

  it("normalizes learned sender values before saving", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      name: "Test Rule",
      groupId: "group-id",
    } as any);
    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "  Sender@Example.COM  ",
      ruleId: "rule-id",
      logger: createTestLogger(),
    });

    expect(prisma.groupItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          value: "sender@example.com",
        }),
      }),
    );
  });

  it("guards automatic updates from user-authored rows", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      name: "Test Rule",
      groupId: "group-id",
    } as any);
    vi.mocked(prisma.groupItem.updateMany).mockResolvedValue({ count: 1 });

    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "  Sender@Example.COM  ",
      ruleId: "rule-id",
      exclude: false,
      logger: createTestLogger(),
      source: GroupItemSource.LABEL_ADDED,
    });

    expect(prisma.groupItem.updateMany).toHaveBeenCalledWith({
      where: {
        groupId: "group-id",
        type: GroupItemType.FROM,
        value: "sender@example.com",
        OR: [{ source: null }, { source: { not: GroupItemSource.USER } }],
      },
      data: expect.objectContaining({
        source: GroupItemSource.LABEL_ADDED,
      }),
    });
    expect(prisma.groupItem.create).not.toHaveBeenCalled();
  });

  it("allows a user-authored update to replace automatic evidence", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      name: "Test Rule",
      groupId: "group-id",
    } as any);
    vi.mocked(prisma.groupItem.updateMany).mockResolvedValue({ count: 1 });

    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "Sender@Example.COM",
      ruleId: "rule-id",
      exclude: true,
      logger: createTestLogger(),
      source: GroupItemSource.USER,
    });

    expect(prisma.groupItem.updateMany).toHaveBeenCalledWith({
      where: {
        groupId: "group-id",
        type: GroupItemType.FROM,
        value: "sender@example.com",
      },
      data: expect.objectContaining({
        exclude: true,
        source: GroupItemSource.USER,
      }),
    });
    expect(prisma.groupItem.create).not.toHaveBeenCalled();
  });

  it("preserves a user pattern created during an automatic save", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      name: "Test Rule",
      groupId: "group-id",
    } as any);
    vi.mocked(prisma.groupItem.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.groupItem.create).mockRejectedValue(
      new Error("Duplicate key"),
    );
    vi.mocked(isDuplicateError).mockReturnValue(true);

    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "Sender@Example.COM",
      ruleId: "rule-id",
      exclude: false,
      logger: createTestLogger(),
      source: GroupItemSource.LABEL_ADDED,
    });

    expect(prisma.groupItem.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.groupItem.updateMany).toHaveBeenCalledWith({
      where: {
        groupId: "group-id",
        type: GroupItemType.FROM,
        value: "sender@example.com",
        OR: [{ source: null }, { source: { not: GroupItemSource.USER } }],
      },
      data: expect.objectContaining({
        exclude: false,
        source: GroupItemSource.LABEL_ADDED,
      }),
    });
    expect(prisma.groupItem.create).toHaveBeenCalledTimes(1);
  });

  it("should create a new group when rule has no groupId", async () => {
    const newGroupId = "new-group-id";
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      name: "Test Rule",
      groupId: null,
    } as any);
    vi.mocked(prisma.group.create).mockResolvedValue({
      id: newGroupId,
    } as any);
    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "test@example.com",
      ruleId: "rule-id",
      logger: createTestLogger(),
    });

    expect(prisma.group.create).toHaveBeenCalledWith({
      data: {
        emailAccountId: "email-account-id",
        name: "Test Rule",
        rule: { connect: { id: "rule-id" } },
      },
    });
    expect(prisma.groupItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: newGroupId,
          type: GroupItemType.FROM,
          value: "test@example.com",
        }),
      }),
    );
  });

  it("should save pattern with exclude: true", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      name: "Test Rule",
      groupId: "group-id",
    } as any);
    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "excluded@example.com",
      ruleId: "rule-id",
      exclude: true,
      logger: createTestLogger(),
      reason: "User excluded",
      source: GroupItemSource.USER,
    });

    expect(prisma.groupItem.create).toHaveBeenCalledWith({
      data: {
        groupId: "group-id",
        type: GroupItemType.FROM,
        value: "excluded@example.com",
        exclude: true,
        reason: "User excluded",
        threadId: undefined,
        messageId: undefined,
        source: GroupItemSource.USER,
      },
    });
  });

  it("should handle duplicate group creation by finding existing group", async () => {
    const existingGroupId = "existing-group-id";
    vi.mocked(prisma.rule.findUnique)
      .mockResolvedValueOnce({
        id: "rule-id",
        name: "Test Rule",
        groupId: null,
      } as any)
      .mockResolvedValueOnce({
        groupId: null,
      } as any);

    const duplicateError = new Error("Duplicate key");
    vi.mocked(prisma.group.create).mockRejectedValue(duplicateError);
    vi.mocked(isDuplicateError).mockReturnValue(true);
    vi.mocked(prisma.group.findUnique).mockResolvedValue({
      id: existingGroupId,
    } as any);
    vi.mocked(prisma.rule.update).mockResolvedValue({} as any);
    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "test@example.com",
      ruleId: "rule-id",
      logger: createTestLogger(),
    });

    expect(prisma.group.findUnique).toHaveBeenCalledWith({
      where: {
        name_emailAccountId: {
          name: "Test Rule",
          emailAccountId: "email-account-id",
        },
      },
      select: { id: true },
    });
    expect(prisma.groupItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: existingGroupId,
          type: GroupItemType.FROM,
          value: "test@example.com",
        }),
      }),
    );
  });
});

describe("saveLearnedPatterns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.groupItem.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.groupItem.create).mockResolvedValue({} as any);
    vi.mocked(isDuplicateError).mockReturnValue(false);
  });

  it("should return error if rule not found", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue(null);

    const result = await saveLearnedPatterns({
      emailAccountId: "email-account-id",
      ruleName: "Nonexistent Rule",
      patterns: [{ type: GroupItemType.FROM, value: "test@example.com" }],
      logger: createTestLogger(),
    });

    expect(result).toEqual({ error: "Rule not found" });
  });

  it("should save multiple patterns successfully", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      groupId: "group-id",
    } as any);
    const result = await saveLearnedPatterns({
      emailAccountId: "email-account-id",
      ruleName: "Test Rule",
      patterns: [
        { type: GroupItemType.FROM, value: "sender1@example.com" },
        { type: GroupItemType.SUBJECT, value: "Newsletter", exclude: true },
      ],
      logger: createTestLogger(),
    });

    expect(result).toEqual({ success: true });
    expect(prisma.groupItem.create).toHaveBeenCalledTimes(2);
  });

  it("normalizes explicit learned patterns and records them as user-authored", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      groupId: "group-id",
    } as any);
    const result = await saveLearnedPatterns({
      emailAccountId: "email-account-id",
      ruleName: "Test Rule",
      patterns: [
        {
          type: GroupItemType.FROM,
          value: "  Sender@Example.COM  ",
          exclude: true,
        },
      ],
      logger: createTestLogger(),
    });

    expect(result).toEqual({ success: true });
    expect(prisma.groupItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: "group-id",
          type: GroupItemType.FROM,
          value: "sender@example.com",
          source: GroupItemSource.USER,
        }),
      }),
    );
  });
});
