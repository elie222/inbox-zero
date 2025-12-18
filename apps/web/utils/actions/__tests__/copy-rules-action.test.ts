import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { copyRulesFromAccountAction } from "@/utils/actions/rule";
import {
  getAction,
  getMockEmailAccountWithAccount,
  getRule,
} from "@/__tests__/helpers";
import { ActionType } from "@/generated/prisma/enums";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user1", email: "test@test.com" } })),
}));

const sourceAccountId = "source-account-id";
const targetAccountId = "target-account-id";

describe("copyRulesFromAccountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws error when source and target accounts are the same", async () => {
    const result = await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: sourceAccountId,
      ruleIds: ["rule1"],
    });

    expect(result?.serverError).toBe(
      "Source and target accounts must be different",
    );
  });

  it("throws error when source account not found", async () => {
    prisma.emailAccount.findUnique.mockResolvedValueOnce(null);
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: targetAccountId,
        userId: "user1",
      }) as any,
    );

    const result = await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: targetAccountId,
      ruleIds: ["rule1"],
    });

    expect(result?.serverError).toBe(
      "Source account not found or unauthorized",
    );
  });

  it("throws error when source account belongs to different user", async () => {
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: sourceAccountId,
        userId: "other-user",
      }) as any,
    );
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: targetAccountId,
        userId: "user1",
      }) as any,
    );

    const result = await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: targetAccountId,
      ruleIds: ["rule1"],
    });

    expect(result?.serverError).toBe(
      "Source account not found or unauthorized",
    );
  });

  it("throws error when target account not found", async () => {
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: sourceAccountId,
        userId: "user1",
      }) as any,
    );
    prisma.emailAccount.findUnique.mockResolvedValueOnce(null);

    const result = await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: targetAccountId,
      ruleIds: ["rule1"],
    });

    expect(result?.serverError).toBe(
      "Target account not found or unauthorized",
    );
  });

  it("throws error when target account belongs to different user", async () => {
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: sourceAccountId,
        userId: "user1",
      }) as any,
    );
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: targetAccountId,
        userId: "other-user",
      }) as any,
    );

    const result = await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: targetAccountId,
      ruleIds: ["rule1"],
    });

    expect(result?.serverError).toBe(
      "Target account not found or unauthorized",
    );
  });

  it("returns zero counts when no rules found in source", async () => {
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: sourceAccountId,
        userId: "user1",
      }) as any,
    );
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: targetAccountId,
        userId: "user1",
      }) as any,
    );
    prisma.rule.findMany.mockResolvedValueOnce([]);

    const result = await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: targetAccountId,
      ruleIds: ["rule1"],
    });

    expect(result?.data).toEqual({ copiedCount: 0, replacedCount: 0 });
    expect(prisma.rule.create).not.toHaveBeenCalled();
    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it("creates new rules when no matching rule exists in target", async () => {
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: sourceAccountId,
        userId: "user1",
      }) as any,
    );
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: targetAccountId,
        userId: "user1",
      }) as any,
    );

    const sourceRule = {
      ...getRule("Test instructions", [], "My Rule"),
      id: "rule1",
      emailAccountId: sourceAccountId,
      actions: [
        getAction({
          type: ActionType.LABEL,
          label: "Important",
          labelId: "label-123",
        }),
      ],
    };
    prisma.rule.findMany.mockResolvedValueOnce([sourceRule] as any);
    prisma.rule.findMany.mockResolvedValueOnce([]);
    prisma.rule.create.mockResolvedValue({} as any);

    const result = await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: targetAccountId,
      ruleIds: ["rule1"],
    });

    expect(result?.data).toEqual({ copiedCount: 1, replacedCount: 0 });
    expect(prisma.rule.create).toHaveBeenCalledTimes(1);
    expect(prisma.rule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emailAccountId: targetAccountId,
        name: "My Rule",
        instructions: "Test instructions",
        groupId: null,
        actions: {
          createMany: {
            data: [
              expect.objectContaining({
                type: ActionType.LABEL,
                label: "Important",
                labelId: null,
              }),
            ],
          },
        },
      }),
    });
  });

  it("updates existing rule when matching by name (case-insensitive)", async () => {
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: sourceAccountId,
        userId: "user1",
      }) as any,
    );
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: targetAccountId,
        userId: "user1",
      }) as any,
    );

    const sourceRule = {
      ...getRule("Updated instructions", [], "My Rule"),
      id: "rule1",
      emailAccountId: sourceAccountId,
      actions: [],
    };
    prisma.rule.findMany.mockResolvedValueOnce([sourceRule] as any);
    prisma.rule.findMany.mockResolvedValueOnce([
      { id: "existing-rule-id", name: "my rule", systemType: null },
    ] as any);
    prisma.rule.update.mockResolvedValue({} as any);

    const result = await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: targetAccountId,
      ruleIds: ["rule1"],
    });

    expect(result?.data).toEqual({ copiedCount: 0, replacedCount: 1 });
    expect(prisma.rule.update).toHaveBeenCalledTimes(1);
    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: "existing-rule-id" },
      data: expect.objectContaining({
        instructions: "Updated instructions",
        groupId: null,
        actions: {
          deleteMany: {},
          createMany: { data: [] },
        },
      }),
    });
    expect(prisma.rule.create).not.toHaveBeenCalled();
  });

  it("updates existing rule when matching by systemType", async () => {
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: sourceAccountId,
        userId: "user1",
      }) as any,
    );
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: targetAccountId,
        userId: "user1",
      }) as any,
    );

    const sourceRule = {
      ...getRule("System rule instructions", [], "System Rule"),
      id: "rule1",
      emailAccountId: sourceAccountId,
      systemType: "TO_REPLY",
      actions: [],
    };
    prisma.rule.findMany.mockResolvedValueOnce([sourceRule] as any);
    prisma.rule.findMany.mockResolvedValueOnce([
      {
        id: "target-system-rule",
        name: "Different Name",
        systemType: "TO_REPLY",
      },
    ] as any);
    prisma.rule.update.mockResolvedValue({} as any);

    const result = await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: targetAccountId,
      ruleIds: ["rule1"],
    });

    expect(result?.data).toEqual({ copiedCount: 0, replacedCount: 1 });
    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: "target-system-rule" },
      data: expect.objectContaining({
        instructions: "System rule instructions",
      }),
    });
  });

  it("clears labelId and folderId but preserves label and folderName", async () => {
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: sourceAccountId,
        userId: "user1",
      }) as any,
    );
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: targetAccountId,
        userId: "user1",
      }) as any,
    );

    const sourceRule = {
      ...getRule("Test", [], "Rule with actions"),
      id: "rule1",
      emailAccountId: sourceAccountId,
      actions: [
        getAction({
          type: ActionType.LABEL,
          label: "MyLabel",
          labelId: "label-id-to-clear",
        }),
        getAction({
          type: ActionType.MOVE_FOLDER,
          folderName: "MyFolder",
          folderId: "folder-id-to-clear",
        }),
      ],
    };
    prisma.rule.findMany.mockResolvedValueOnce([sourceRule] as any);
    prisma.rule.findMany.mockResolvedValueOnce([]);
    prisma.rule.create.mockResolvedValue({} as any);

    await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: targetAccountId,
      ruleIds: ["rule1"],
    });

    expect(prisma.rule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actions: {
          createMany: {
            data: [
              expect.objectContaining({
                type: ActionType.LABEL,
                label: "MyLabel",
                labelId: null,
              }),
              expect.objectContaining({
                type: ActionType.MOVE_FOLDER,
                folderName: "MyFolder",
                folderId: null,
              }),
            ],
          },
        },
      }),
    });
  });

  it("handles mixed copy and replace scenarios", async () => {
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: sourceAccountId,
        userId: "user1",
      }) as any,
    );
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      getMockEmailAccountWithAccount({
        id: targetAccountId,
        userId: "user1",
      }) as any,
    );

    const sourceRules = [
      {
        ...getRule("Existing rule instructions", [], "Existing Rule"),
        id: "rule1",
        emailAccountId: sourceAccountId,
        actions: [],
      },
      {
        ...getRule("New rule instructions", [], "New Rule"),
        id: "rule2",
        emailAccountId: sourceAccountId,
        actions: [],
      },
    ];
    prisma.rule.findMany.mockResolvedValueOnce(sourceRules as any);
    prisma.rule.findMany.mockResolvedValueOnce([
      { id: "target-rule-1", name: "existing rule", systemType: null },
    ] as any);
    prisma.rule.update.mockResolvedValue({} as any);
    prisma.rule.create.mockResolvedValue({} as any);

    const result = await copyRulesFromAccountAction({
      sourceEmailAccountId: sourceAccountId,
      targetEmailAccountId: targetAccountId,
      ruleIds: ["rule1", "rule2"],
    });

    expect(result?.data).toEqual({ copiedCount: 1, replacedCount: 1 });
    expect(prisma.rule.update).toHaveBeenCalledTimes(1);
    expect(prisma.rule.create).toHaveBeenCalledTimes(1);
  });
});
