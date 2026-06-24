import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import {
  assertOrganizationRuleActionsSupported,
  assertRuleIsNotOrgManaged,
  computeMemberRuleEnabled,
  deleteOrganizationRuleAndMemberCopies,
  setMemberOrganizationRuleEnabled,
  setOrganizationRuleEnabled,
  syncOrganizationRuleToMembers,
  syncOrganizationRulesForNewMember,
} from "./rules";

vi.mock("@/utils/prisma");

const logger = createTestLogger();

function orgAction(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-action-1",
    organizationRuleId: "org-rule-1",
    type: ActionType.LABEL,
    label: "Invoices",
    subject: null,
    content: null,
    to: null,
    cc: null,
    bcc: null,
    url: null,
    folderName: null,
    delayInMinutes: null,
    staticAttachments: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    labelId: "admin-label-id",
    folderId: "admin-folder-id",
    messagingChannelId: "admin-channel-id",
    ...overrides,
  };
}

function orgRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-rule-1",
    organizationId: "org-1",
    enabled: true,
    name: "Invoices",
    instructions: "Emails that look like invoices",
    runOnThreads: false,
    conditionalOperator: LogicalOperator.AND,
    from: null,
    to: null,
    subject: null,
    body: null,
    actions: [orgAction()],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("computeMemberRuleEnabled", () => {
  it.each([
    { orgEnabled: true, memberEnabled: true, expected: true },
    { orgEnabled: true, memberEnabled: false, expected: false },
    { orgEnabled: false, memberEnabled: true, expected: false },
    { orgEnabled: false, memberEnabled: false, expected: false },
  ])("org=$orgEnabled member=$memberEnabled -> $expected", ({
    orgEnabled,
    memberEnabled,
    expected,
  }) => {
    expect(computeMemberRuleEnabled({ orgEnabled, memberEnabled })).toBe(
      expected,
    );
  });
});

describe("assertOrganizationRuleActionsSupported", () => {
  it("rejects messaging channel actions", () => {
    expect(() =>
      assertOrganizationRuleActionsSupported([
        { type: ActionType.NOTIFY_MESSAGING_CHANNEL },
      ]),
    ).toThrow();
    expect(() =>
      assertOrganizationRuleActionsSupported([
        { type: ActionType.DRAFT_MESSAGING_CHANNEL },
      ]),
    ).toThrow();
  });

  it("allows non-messaging actions", () => {
    expect(() =>
      assertOrganizationRuleActionsSupported([
        { type: ActionType.LABEL },
        { type: ActionType.ARCHIVE },
      ]),
    ).not.toThrow();
  });
});

describe("syncOrganizationRuleToMembers", () => {
  beforeEach(() => {
    prisma.organizationRule.findUnique.mockResolvedValue(orgRule() as never);
    prisma.member.findMany.mockResolvedValue([
      { emailAccountId: "ea-1" },
      { emailAccountId: "ea-2" },
    ] as never);
  });

  it("creates one member copy per member with org link and member opt-in", async () => {
    prisma.rule.findFirst.mockResolvedValue(null as never);
    prisma.rule.create.mockResolvedValue({} as never);

    await syncOrganizationRuleToMembers({
      organizationRuleId: "org-rule-1",
      logger,
    });

    expect(prisma.rule.create).toHaveBeenCalledTimes(2);

    const createData = prisma.rule.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createData).toMatchObject({
      emailAccountId: "ea-1",
      organizationRuleId: "org-rule-1",
      organizationRuleMemberEnabled: true,
      enabled: true,
      name: "Invoices",
    });
  });

  it("copies only portable action fields, never provider-specific ids", async () => {
    prisma.rule.findFirst.mockResolvedValue(null as never);
    prisma.rule.create.mockResolvedValue({} as never);

    await syncOrganizationRuleToMembers({
      organizationRuleId: "org-rule-1",
      logger,
    });

    const createData = prisma.rule.create.mock.calls[0]?.[0]?.data as {
      actions: { createMany: { data: Record<string, unknown>[] } };
    };
    const action = createData.actions.createMany.data[0];

    expect(action).toMatchObject({ type: ActionType.LABEL, label: "Invoices" });
    expect(action).not.toHaveProperty("labelId");
    expect(action).not.toHaveProperty("folderId");
    expect(action).not.toHaveProperty("messagingChannelId");
    expect(action).not.toHaveProperty("id");
    expect(action).not.toHaveProperty("organizationRuleId");
  });

  it("overwrites an existing copy but preserves the member opt-in and recomputes enabled", async () => {
    prisma.member.findMany.mockResolvedValue([
      { emailAccountId: "ea-1" },
    ] as never);
    prisma.rule.findFirst.mockResolvedValue({
      id: "member-rule-1",
      organizationRuleMemberEnabled: false,
    } as never);
    prisma.rule.update.mockResolvedValue({} as never);

    await syncOrganizationRuleToMembers({
      organizationRuleId: "org-rule-1",
      logger,
    });

    expect(prisma.rule.create).not.toHaveBeenCalled();
    const updateArgs = prisma.rule.update.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(updateArgs.where).toEqual({
      id: "member-rule-1",
      emailAccountId: "ea-1",
    });
    expect(updateArgs.data.organizationRuleMemberEnabled).toBe(false);
    expect(updateArgs.data.enabled).toBe(false);
  });

  it("disables the copy when the org rule is disabled", async () => {
    prisma.organizationRule.findUnique.mockResolvedValue(
      orgRule({ enabled: false }) as never,
    );
    prisma.member.findMany.mockResolvedValue([
      { emailAccountId: "ea-1" },
    ] as never);
    prisma.rule.findFirst.mockResolvedValue(null as never);
    prisma.rule.create.mockResolvedValue({} as never);

    await syncOrganizationRuleToMembers({
      organizationRuleId: "org-rule-1",
      logger,
    });

    const createData = prisma.rule.create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(createData.enabled).toBe(false);
    expect(createData.organizationRuleMemberEnabled).toBe(true);
  });

  it("renames the copy when the name conflicts with a member's personal rule", async () => {
    prisma.member.findMany.mockResolvedValue([
      { emailAccountId: "ea-1" },
    ] as never);
    prisma.rule.findFirst.mockResolvedValue(null as never);

    const nameConflict = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["name", "emailAccountId"] },
    });
    prisma.rule.create
      .mockRejectedValueOnce(nameConflict)
      .mockResolvedValueOnce({} as never);
    prisma.rule.findMany.mockResolvedValue([{ name: "Invoices" }] as never);

    await syncOrganizationRuleToMembers({
      organizationRuleId: "org-rule-1",
      logger,
    });

    expect(prisma.rule.create).toHaveBeenCalledTimes(2);
    const retryData = prisma.rule.create.mock.calls[1]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(retryData.name).toBe("Invoices (2)");
    expect(retryData.organizationRuleId).toBe("org-rule-1");
  });
});

describe("syncOrganizationRulesForNewMember", () => {
  it("materializes every org rule for the new member", async () => {
    prisma.organizationRule.findMany.mockResolvedValue([
      orgRule({ id: "org-rule-1", name: "Invoices" }),
      orgRule({ id: "org-rule-2", name: "Newsletters" }),
    ] as never);
    prisma.rule.findFirst.mockResolvedValue(null as never);
    prisma.rule.create.mockResolvedValue({} as never);

    await syncOrganizationRulesForNewMember({
      organizationId: "org-1",
      emailAccountId: "ea-new",
      logger,
    });

    expect(prisma.rule.create).toHaveBeenCalledTimes(2);
    const ruleIds = prisma.rule.create.mock.calls.map(
      (call) => (call[0]?.data as Record<string, unknown>).organizationRuleId,
    );
    expect(ruleIds).toEqual(["org-rule-1", "org-rule-2"]);
  });
});

describe("setOrganizationRuleEnabled", () => {
  beforeEach(() => {
    prisma.organizationRule.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.rule.updateMany.mockResolvedValue({ count: 1 } as never);
  });

  it("disables all member copies when the org rule is disabled", async () => {
    await setOrganizationRuleEnabled({
      organizationRuleId: "org-rule-1",
      organizationId: "org-1",
      enabled: false,
    });

    expect(prisma.organizationRule.updateMany).toHaveBeenCalledWith({
      where: { id: "org-rule-1", organizationId: "org-1" },
      data: { enabled: false },
    });
    expect(prisma.rule.updateMany).toHaveBeenCalledWith({
      where: { organizationRuleId: "org-rule-1" },
      data: { enabled: false },
    });
  });

  it("re-derives member copies from their opt-in when the org rule is enabled", async () => {
    await setOrganizationRuleEnabled({
      organizationRuleId: "org-rule-1",
      organizationId: "org-1",
      enabled: true,
    });

    expect(prisma.rule.updateMany).toHaveBeenCalledWith({
      where: {
        organizationRuleId: "org-rule-1",
        NOT: { organizationRuleMemberEnabled: false },
      },
      data: { enabled: true },
    });
    expect(prisma.rule.updateMany).toHaveBeenCalledWith({
      where: {
        organizationRuleId: "org-rule-1",
        organizationRuleMemberEnabled: false,
      },
      data: { enabled: false },
    });
  });
});

describe("setMemberOrganizationRuleEnabled", () => {
  it("updates the member opt-in and recomputed enabled flag", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      organizationRuleId: "org-rule-1",
      organizationRule: { enabled: true },
    } as never);
    prisma.rule.update.mockResolvedValue({} as never);

    await setMemberOrganizationRuleEnabled({
      ruleId: "member-rule-1",
      emailAccountId: "ea-1",
      enabled: false,
    });

    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: {
        id_emailAccountId: { id: "member-rule-1", emailAccountId: "ea-1" },
      },
      data: { organizationRuleMemberEnabled: false, enabled: false },
    });
  });

  it("rejects toggling a rule that is not org-managed", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      organizationRuleId: null,
      organizationRule: null,
    } as never);

    await expect(
      setMemberOrganizationRuleEnabled({
        ruleId: "personal-rule",
        emailAccountId: "ea-1",
        enabled: true,
      }),
    ).rejects.toThrow();
    expect(prisma.rule.update).not.toHaveBeenCalled();
  });
});

describe("deleteOrganizationRuleAndMemberCopies", () => {
  it("deletes the org rule scoped to the organization", async () => {
    prisma.organizationRule.deleteMany.mockResolvedValue({ count: 1 } as never);

    await deleteOrganizationRuleAndMemberCopies({
      organizationRuleId: "org-rule-1",
      organizationId: "org-1",
    });

    expect(prisma.organizationRule.deleteMany).toHaveBeenCalledWith({
      where: { id: "org-rule-1", organizationId: "org-1" },
    });
  });
});

describe("assertRuleIsNotOrgManaged", () => {
  it("throws for an org-managed rule", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      organizationRuleId: "org-rule-1",
    } as never);

    await expect(
      assertRuleIsNotOrgManaged({ ruleId: "r1", emailAccountId: "ea-1" }),
    ).rejects.toThrow();
  });

  it("passes for a personal rule", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      organizationRuleId: null,
    } as never);

    await expect(
      assertRuleIsNotOrgManaged({ ruleId: "r1", emailAccountId: "ea-1" }),
    ).resolves.toBeUndefined();
  });
});
