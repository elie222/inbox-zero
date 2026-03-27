import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, SystemType } from "@/generated/prisma/enums";

const setRuleEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/rule/rule")>();
  return {
    ...actual,
    setRuleEnabled: setRuleEnabledMock,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "owner@example.com" } })),
}));

import prisma from "@/utils/__mocks__/prisma";
import { enableDraftRepliesAction } from "@/utils/actions/rule";

describe("enableDraftRepliesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
