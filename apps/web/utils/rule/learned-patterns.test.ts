import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveLearnedPattern, saveLearnedPatterns } from "./learned-patterns";
import prisma from "@/utils/__mocks__/prisma";
import { GroupItemType, GroupItemSource } from "@/generated/prisma/enums";
import { isDuplicateError } from "@/utils/prisma-helpers";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

vi.mock("@/utils/prisma-helpers", () => ({
  isDuplicateError: vi.fn(),
}));

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
} as any;

describe("saveLearnedPattern", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return early if rule not found", async () => {
    vi.mocked(prisma.rule.findUnique).mockResolvedValue(null);

    await saveLearnedPattern({
      emailAccountId: "email-account-id",
      from: "test@example.com",
      ruleId: "nonexistent-rule",
      logger: mockLogger,
    });

    expect(mockLogger.error).toHaveBeenCalledWith("Rule not found", {
      ruleId: "nonexistent-rule",
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
      logger: mockLogger,
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
      update: expect.objectContaining({ exclude: false }),
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
      logger: mockLogger,
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
      logger: mockLogger,
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
        source: GroupItemSource.USER,
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
      logger: mockLogger,
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
      logger: mockLogger,
    });

    expect(result).toEqual({ error: "Rule not found" });
    expect(mockLogger.error).toHaveBeenCalledWith("Rule not found", {
      emailAccountId: "email-account-id",
      ruleName: "Nonexistent Rule",
    });
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
      logger: mockLogger,
    });

    expect(result).toEqual({ success: true });
    expect(prisma.groupItem.upsert).toHaveBeenCalledTimes(2);
  });
});
