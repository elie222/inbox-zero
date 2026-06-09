import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import {
  organizationRuleAppliesToMember,
  syncOrganizationRule,
  syncOrganizationRulesForMember,
} from "@/utils/organizations/organization-rules";
import {
  createRuleWithResolvedActions,
  replaceRuleWithResolvedActions,
} from "@/utils/rule/rule";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/rule/rule", () => ({
  createRuleWithResolvedActions: vi.fn(),
  replaceRuleWithResolvedActions: vi.fn(),
}));

const logger = createScopedLogger("organization-rules-test");

const mockedCreateRule = vi.mocked(createRuleWithResolvedActions);
const mockedReplaceRule = vi.mocked(replaceRuleWithResolvedActions);

function getOrganizationRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-rule-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    organizationId: "org-1",
    name: "Security alerts",
    enabled: true,
    runOnThreads: false,
    conditionalOperator: LogicalOperator.AND,
    instructions: "Emails about security incidents",
    from: null,
    to: null,
    subject: null,
    body: null,
    actions: [
      {
        id: "org-action-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        organizationRuleId: "org-rule-1",
        type: ActionType.LABEL,
        label: "Security",
        subject: null,
        content: null,
        to: null,
        cc: null,
        bcc: null,
        url: null,
        folderName: null,
        delayInMinutes: null,
      },
    ],
    teams: [],
    ...overrides,
  };
}

function getMember({
  emailAccountId,
  email,
  teamId = null,
}: {
  emailAccountId: string;
  email: string;
  teamId?: string | null;
}) {
  return { teamId, emailAccount: { id: emailAccountId, email } };
}

describe("organizationRuleAppliesToMember", () => {
  it("applies to every member when the rule has no teams", () => {
    expect(
      organizationRuleAppliesToMember({ ruleTeamIds: [], memberTeamId: null }),
    ).toBe(true);
    expect(
      organizationRuleAppliesToMember({
        ruleTeamIds: [],
        memberTeamId: "team-1",
      }),
    ).toBe(true);
  });

  it("applies only to members of targeted teams", () => {
    expect(
      organizationRuleAppliesToMember({
        ruleTeamIds: ["team-1"],
        memberTeamId: "team-1",
      }),
    ).toBe(true);
    expect(
      organizationRuleAppliesToMember({
        ruleTeamIds: ["team-1"],
        memberTeamId: "team-2",
      }),
    ).toBe(false);
    expect(
      organizationRuleAppliesToMember({
        ruleTeamIds: ["team-1"],
        memberTeamId: null,
      }),
    ).toBe(false);
  });
});

describe("syncOrganizationRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provisions the rule into every member account when it has no teams", async () => {
    prisma.organizationRule.findUnique.mockResolvedValue(
      getOrganizationRule() as never,
    );
    prisma.member.findMany.mockResolvedValue([
      getMember({ emailAccountId: "account-1", email: "a@org.com" }),
      getMember({ emailAccountId: "account-2", email: "b@org.com" }),
    ] as never);
    prisma.rule.findMany.mockResolvedValue([]);

    const result = await syncOrganizationRule({
      organizationRuleId: "org-rule-1",
      logger,
    });

    expect(result).toEqual({
      createdCount: 2,
      updatedCount: 0,
      removedCount: 0,
      skipped: [],
    });
    expect(mockedCreateRule).toHaveBeenCalledTimes(2);
    expect(mockedCreateRule).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        data: expect.objectContaining({
          name: "Security alerts",
          organizationRuleId: "org-rule-1",
          instructions: "Emails about security incidents",
        }),
        actions: [
          expect.objectContaining({
            type: ActionType.LABEL,
            label: "Security",
            labelId: null,
          }),
        ],
      }),
    );
  });

  it("only targets members of the rule's teams and removes copies from others", async () => {
    prisma.organizationRule.findUnique.mockResolvedValue(
      getOrganizationRule({ teams: [{ id: "team-eng" }] }) as never,
    );
    prisma.member.findMany.mockResolvedValue([
      getMember({
        emailAccountId: "account-1",
        email: "dev@org.com",
        teamId: "team-eng",
      }),
      getMember({
        emailAccountId: "account-2",
        email: "marketer@org.com",
        teamId: "team-marketing",
      }),
    ] as never);
    // account-2 previously had a managed copy (e.g. before re-targeting)
    prisma.rule.findMany.mockResolvedValue([
      { id: "rule-2", emailAccountId: "account-2" },
    ] as never);
    prisma.rule.deleteMany.mockResolvedValue({ count: 1 });

    const result = await syncOrganizationRule({
      organizationRuleId: "org-rule-1",
      logger,
    });

    expect(result).toEqual({
      createdCount: 1,
      updatedCount: 0,
      removedCount: 1,
      skipped: [],
    });
    expect(prisma.rule.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["rule-2"] }, organizationRuleId: "org-rule-1" },
    });
    expect(mockedCreateRule).toHaveBeenCalledTimes(1);
    expect(mockedCreateRule).toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "account-1" }),
    );
  });

  it("updates already-provisioned copies in place", async () => {
    prisma.organizationRule.findUnique.mockResolvedValue(
      getOrganizationRule() as never,
    );
    prisma.member.findMany.mockResolvedValue([
      getMember({ emailAccountId: "account-1", email: "a@org.com" }),
    ] as never);
    prisma.rule.findMany.mockResolvedValue([
      { id: "managed-rule-1", emailAccountId: "account-1" },
    ] as never);

    const result = await syncOrganizationRule({
      organizationRuleId: "org-rule-1",
      logger,
    });

    expect(result.updatedCount).toBe(1);
    expect(mockedCreateRule).not.toHaveBeenCalled();
    expect(mockedReplaceRule).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: "managed-rule-1",
        emailAccountId: "account-1",
        allowOrganizationManaged: true,
      }),
    );
  });

  it("skips members whose account already has a rule with the same name", async () => {
    prisma.organizationRule.findUnique.mockResolvedValue(
      getOrganizationRule() as never,
    );
    prisma.member.findMany.mockResolvedValue([
      getMember({ emailAccountId: "account-1", email: "a@org.com" }),
      getMember({ emailAccountId: "account-2", email: "b@org.com" }),
    ] as never);
    prisma.rule.findMany.mockResolvedValue([]);

    mockedCreateRule.mockImplementation(async ({ emailAccountId }) => {
      if (emailAccountId === "account-2") {
        throw new Prisma.PrismaClientKnownRequestError(
          "Unique constraint failed",
          {
            code: "P2002",
            clientVersion: "test",
            meta: { target: ["name", "emailAccountId"] },
          },
        );
      }
      return {} as never;
    });

    const result = await syncOrganizationRule({
      organizationRuleId: "org-rule-1",
      logger,
    });

    expect(result.createdCount).toBe(1);
    expect(result.skipped).toEqual([
      { email: "b@org.com", reason: expect.stringContaining("already exists") },
    ]);
  });
});

describe("syncOrganizationRulesForMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provisions applicable rules and removes ones that no longer apply", async () => {
    prisma.member.findFirst.mockResolvedValue({ teamId: "team-eng" } as never);
    prisma.organizationRule.findMany.mockResolvedValue([
      getOrganizationRule({ id: "org-rule-all", teams: [] }),
      getOrganizationRule({
        id: "org-rule-eng",
        name: "Engineering rule",
        teams: [{ id: "team-eng" }],
      }),
      getOrganizationRule({
        id: "org-rule-marketing",
        name: "Marketing rule",
        teams: [{ id: "team-marketing" }],
      }),
    ] as never);
    // member previously had a copy of the marketing rule (team change)
    prisma.rule.findMany.mockResolvedValue([
      { id: "managed-marketing", organizationRuleId: "org-rule-marketing" },
    ] as never);
    prisma.rule.deleteMany.mockResolvedValue({ count: 1 });

    await syncOrganizationRulesForMember({
      emailAccountId: "account-1",
      organizationId: "org-1",
      logger,
    });

    expect(prisma.rule.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["managed-marketing"] }, emailAccountId: "account-1" },
    });
    expect(mockedCreateRule).toHaveBeenCalledTimes(2);
    expect(mockedCreateRule).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationRuleId: "org-rule-all" }),
      }),
    );
    expect(mockedCreateRule).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationRuleId: "org-rule-eng" }),
      }),
    );
  });

  it("removes all managed rules when the member no longer exists", async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    prisma.organizationRule.findMany.mockResolvedValue([
      getOrganizationRule(),
    ] as never);
    prisma.rule.findMany.mockResolvedValue([
      { id: "managed-1", organizationRuleId: "org-rule-1" },
    ] as never);
    prisma.rule.deleteMany.mockResolvedValue({ count: 1 });

    await syncOrganizationRulesForMember({
      emailAccountId: "account-1",
      organizationId: "org-1",
      logger,
    });

    expect(prisma.rule.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["managed-1"] }, emailAccountId: "account-1" },
    });
    expect(mockedCreateRule).not.toHaveBeenCalled();
  });
});
