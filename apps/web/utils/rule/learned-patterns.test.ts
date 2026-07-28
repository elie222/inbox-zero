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
  });

  // A caller that omits a field must not reset it. Overwriting exclude would silently
  // re-block a sender the user had corrected, and overwriting source would lose how the
  // pattern was first learned.
  describe("updating an existing pattern", () => {
    const getUpsertArgs = () =>
      vi.mocked(prisma.groupItem.upsert).mock.calls[0][0] as any;

    beforeEach(() => {
      vi.mocked(prisma.rule.findUnique).mockResolvedValue({
        id: "rule-id",
        name: "Test Rule",
        groupId: "group-id",
      } as any);
      vi.mocked(prisma.groupItem.upsert).mockResolvedValue({} as any);
    });

    it("leaves exclude untouched when the caller omits it", async () => {
      await saveLearnedPattern({
        emailAccountId: "email-account-id",
        from: "test@example.com",
        ruleId: "rule-id",
        source: GroupItemSource.AI,
        logger: createTestLogger(),
      });

      expect(getUpsertArgs().update.exclude).toBeUndefined();
      expect(getUpsertArgs().create.exclude).toBe(false);
    });

    it("never overwrites source", async () => {
      await saveLearnedPattern({
        emailAccountId: "email-account-id",
        from: "test@example.com",
        ruleId: "rule-id",
        source: GroupItemSource.AI,
        logger: createTestLogger(),
      });

      expect(getUpsertArgs().update).not.toHaveProperty("source");
      expect(getUpsertArgs().create.source).toBe(GroupItemSource.AI);
    });

    it("still applies exclude when the caller passes it", async () => {
      await saveLearnedPattern({
        emailAccountId: "email-account-id",
        from: "test@example.com",
        ruleId: "rule-id",
        exclude: true,
        logger: createTestLogger(),
      });

      expect(getUpsertArgs().update.exclude).toBe(true);
    });
  });

  it("should return early if rule not found", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue(null);

    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "test@example.com",
      ruleId: "nonexistent-rule",
      logger: createTestLogger(),
    });

    expect(prisma.groupItem.upsert).not.toHaveBeenCalled();
  });

  it("should use existing groupId when rule has one", async () => {
    const existingGroupId = "existing-group-id";
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      name: "Test Rule",
      groupId: existingGroupId,
    } as any);
    vi.mocked(prisma.groupItem.upsert).mockResolvedValue({} as any);

    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "test@example.com",
      ruleId: "rule-id",
      logger: createTestLogger(),
    });

    expect(prisma.group.create).not.toHaveBeenCalled();
    expect(prisma.groupItem.upsert).toHaveBeenCalledWith({
      where: {
        groupId_type_value: {
          groupId: existingGroupId,
          type: GroupItemType.FROM,
          value: "test@example.com",
        },
      },
      update: expect.objectContaining({ exclude: undefined }),
      create: expect.objectContaining({
        groupId: existingGroupId,
        type: GroupItemType.FROM,
        value: "test@example.com",
      }),
    });
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
    vi.mocked(prisma.groupItem.upsert).mockResolvedValue({} as any);

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
    expect(prisma.groupItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId_type_value: {
            groupId: newGroupId,
            type: GroupItemType.FROM,
            value: "test@example.com",
          },
        },
      }),
    );
  });

  it("should save pattern with exclude: true", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue({
      id: "rule-id",
      name: "Test Rule",
      groupId: "group-id",
    } as any);
    vi.mocked(prisma.groupItem.upsert).mockResolvedValue({} as any);

    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "excluded@example.com",
      ruleId: "rule-id",
      exclude: true,
      logger: createTestLogger(),
      reason: "User excluded",
      source: GroupItemSource.USER,
    });

    expect(prisma.groupItem.upsert).toHaveBeenCalledWith({
      where: {
        groupId_type_value: {
          groupId: "group-id",
          type: GroupItemType.FROM,
          value: "excluded@example.com",
        },
      },
      update: {
        exclude: true,
        reason: "User excluded",
        threadId: undefined,
        messageId: undefined,
      },
      create: {
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
    vi.mocked(prisma.groupItem.upsert).mockResolvedValue({} as any);

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
    expect(prisma.groupItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId_type_value: {
            groupId: existingGroupId,
            type: GroupItemType.FROM,
            value: "test@example.com",
          },
        },
      }),
    );
  });
});

describe("saveLearnedPatterns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(prisma.groupItem.upsert).mockResolvedValue({} as any);

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
    expect(prisma.groupItem.upsert).toHaveBeenCalledTimes(2);
  });
});
