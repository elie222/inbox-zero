import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";

const { createEmailProviderMock, createRuleHistoryMock, setRuleEnabledMock } =
  vi.hoisted(() => ({
    createEmailProviderMock: vi.fn(),
    createRuleHistoryMock: vi.fn(),
    setRuleEnabledMock: vi.fn(),
  }));

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/rule/rule")>();
  return {
    ...actual,
    setRuleEnabled: setRuleEnabledMock,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));
vi.mock("@/utils/rule/rule-history", () => ({
  createRuleHistory: createRuleHistoryMock,
}));
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "owner@example.com" } })),
}));

import prisma from "@/utils/__mocks__/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import {
  deleteRuleAction,
  enableDraftRepliesAction,
  updateRuleAction,
} from "@/utils/actions/rule";

describe("enableDraftRepliesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createEmailProvider).mockResolvedValue({} as any);
  });

  it("re-enables the existing to-reply rule before adding draft actions", async () => {
    (
      prisma.emailAccount.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.rule.findUnique.mockResolvedValue({
      id: "rule-1",
      enabled: false,
      systemType: SystemType.TO_REPLY,
      actions: [],
    } as never);

    setRuleEnabledMock.mockResolvedValue({
      id: "rule-1",
      enabled: true,
      actions: [],
    });

    await enableDraftRepliesAction("ea_1" as never, { enable: true } as never);

    expect(setRuleEnabledMock).toHaveBeenCalledWith({
      ruleId: "rule-1",
      emailAccountId: "ea_1",
      enabled: true,
    });
    expect(prisma.action.create).toHaveBeenCalledWith({
      data: {
        emailAccountId: "ea_1",
        messagingChannelEmailAccountId: null,
        ruleId: "rule-1",
        type: ActionType.DRAFT_EMAIL,
      },
    });
  });

  it("disables the existing to-reply rule when draft replies are turned off", async () => {
    (
      prisma.emailAccount.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.rule.findUnique.mockResolvedValue({
      id: "rule-1",
      enabled: true,
      systemType: SystemType.TO_REPLY,
      actions: [{ type: ActionType.DRAFT_EMAIL }],
    } as never);

    setRuleEnabledMock.mockResolvedValue({
      id: "rule-1",
      enabled: false,
      actions: [{ type: ActionType.DRAFT_EMAIL }],
    });

    await enableDraftRepliesAction("ea_1" as never, { enable: false } as never);

    expect(setRuleEnabledMock).toHaveBeenCalledWith({
      ruleId: "rule-1",
      emailAccountId: "ea_1",
      enabled: false,
    });
    expect(prisma.action.deleteMany).toHaveBeenCalledWith({
      where: {
        ruleId: "rule-1",
        type: ActionType.DRAFT_EMAIL,
      },
    });
  });
});

describe("deleteRuleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createEmailProvider).mockResolvedValue({} as any);
  });

  it("rejects deleting default rules", async () => {
    (
      prisma.emailAccount.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.rule.findUnique.mockResolvedValue({
      id: "rule-1",
      emailAccountId: "ea_1",
      systemType: SystemType.NEWSLETTER,
      groupId: null,
    } as never);

    const result = await deleteRuleAction(
      "ea_1" as never,
      {
        id: "rule-1",
      } as never,
    );

    expect(result?.serverError).toBe(
      "Default rules cannot be deleted. Disable them instead.",
    );
    expect(prisma.rule.delete).not.toHaveBeenCalled();
    expect(prisma.group.deleteMany).not.toHaveBeenCalled();
  });
});

describe("updateRuleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createEmailProvider).mockResolvedValue({} as any);
    prisma.rule.findMany.mockResolvedValue([]);
  });

  it("scopes the rule update to the bound email account", async () => {
    (
      prisma.emailAccount.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.rule.update.mockResolvedValue({
      id: "victim-rule",
      actions: [],
      group: null,
    } as never);

    const result = await updateRuleAction(
      "attacker-account" as never,
      {
        id: "victim-rule",
        name: "Updated rule",
        instructions: null,
        groupId: null,
        runOnThreads: true,
        digest: false,
        actions: [
          {
            type: ActionType.ARCHIVE,
            messagingChannelId: null,
            labelId: null,
            subject: null,
            content: null,
            to: null,
            cc: null,
            bcc: null,
            url: null,
            folderName: null,
            folderId: null,
            delayInMinutes: null,
          },
        ],
        conditions: [
          {
            type: ConditionType.STATIC,
            instructions: null,
            to: null,
            from: "sender@example.com",
            subject: null,
            body: null,
          },
        ],
        conditionalOperator: "AND",
        systemType: null,
      } as never,
    );

    expect(result?.serverError).toBeUndefined();
    expect(prisma.rule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "victim-rule",
          emailAccountId: "attacker-account",
        },
      }),
    );
  });
});
