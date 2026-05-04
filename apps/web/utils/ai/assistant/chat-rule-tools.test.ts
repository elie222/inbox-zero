import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionType,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import { createRuleTool } from "./tools/rules/create-rule-tool";
import { updateRuleTool } from "./tools/rules/update-rule-tool";
import { updateRuleStateTool } from "./tools/rules/update-rule-state-tool";

vi.mock("server-only", () => ({}));

const {
  mockCreateRule,
  mockOutboundActionsNeedChatRiskConfirmation,
  mockPartialUpdateRule,
  mockPrisma,
  mockSetRuleEnabled,
} = vi.hoisted(() => ({
  mockCreateRule: vi.fn(),
  mockOutboundActionsNeedChatRiskConfirmation: vi.fn(),
  mockPartialUpdateRule: vi.fn(),
  mockSetRuleEnabled: vi.fn(),
  mockPrisma: {
    rule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/utils/prisma", () => ({
  default: mockPrisma,
}));

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/rule/rule")>();

  return {
    ...actual,
    createRule: mockCreateRule,
    outboundActionsNeedChatRiskConfirmation:
      mockOutboundActionsNeedChatRiskConfirmation,
    partialUpdateRule: mockPartialUpdateRule,
    setRuleEnabled: mockSetRuleEnabled,
  };
});

const logger = createScopedLogger("chat-rule-tools-test");

const defaultActions = [
  {
    type: ActionType.LABEL,
    fields: { label: "Action" },
    delayInMinutes: null,
  },
];

describe("createRuleTool overlap guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOutboundActionsNeedChatRiskConfirmation.mockReturnValue({
      needsConfirmation: false,
      riskMessages: [],
    });
    mockCreateRule.mockResolvedValue({ id: "new-rule-id" });
    mockPrisma.rule.findMany.mockResolvedValue([
      {
        name: "Team Mail",
        instructions: null,
        from: "@company.example",
        to: null,
        subject: null,
        group: {
          items: [
            {
              value: "store@company.example",
              exclude: true,
              type: GroupItemType.FROM,
            },
          ],
        },
      },
    ]);
  });

  it("blocks overlapping sender-only rules", async () => {
    const result = await createRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
    }).execute({
      name: "Action Mail",
      condition: {
        aiInstructions: null,
        static: { from: "@company.example" },
        conditionalOperator: null,
      },
      actions: defaultActions,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('overlaps the existing "Team Mail"');
    expect(mockCreateRule).not.toHaveBeenCalled();
  });

  it("allows sender rules narrowed by semantic instructions", async () => {
    const result = await createRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
    }).execute({
      name: "Urgent Action Mail",
      condition: {
        aiInstructions: "Only urgent requests from this sender domain.",
        static: { from: "@company.example" },
        conditionalOperator: null,
      },
      actions: defaultActions,
    });

    expect(result).toEqual({ success: true, ruleId: "new-rule-id" });
    expect(mockCreateRule).toHaveBeenCalledOnce();
  });
});

describe("updateRuleTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPartialUpdateRule.mockResolvedValue({ id: "rule-id" });
    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-id",
      name: "Vendor Billing",
      enabled: true,
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
      emailAccount: { rulesRevision: 3 },
      instructions: "Billing notices.",
      from: "billing@vendor.example",
      to: null,
      subject: "invoice",
      conditionalOperator: "AND",
      actions: [],
    });
  });

  it("preserves omitted static fields when patching one static condition", async () => {
    const result = await updateRuleTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      provider: "google",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Vendor Billing", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        condition: {
          conditionalOperator: null,
          static: {
            subject: null,
          },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(mockPartialUpdateRule).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: {
        subject: null,
      },
    });
  });
});

describe("updateRuleStateTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetRuleEnabled.mockResolvedValue({ id: "rule-id", enabled: false });
    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-id",
      name: "Team Mail",
      enabled: true,
      systemType: null,
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
      emailAccount: { rulesRevision: 3 },
    });
  });

  it("disables a rule without clearing its actions", async () => {
    const result = await updateRuleStateTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Team Mail", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Team Mail",
      operation: "disable",
    });

    expect(result).toEqual({
      success: true,
      ruleId: "rule-id",
      ruleName: "Team Mail",
      operation: "disable",
      enabled: false,
      previousEnabled: true,
    });
    expect(mockSetRuleEnabled).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      enabled: false,
    });
  });

  it("returns a pending confirmation for deleting a custom rule", async () => {
    const result = await updateRuleStateTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["Team Mail", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "Team Mail",
      operation: "delete",
    });

    expect(result).toEqual({
      success: true,
      actionType: "delete_rule",
      requiresConfirmation: true,
      confirmationState: "pending",
      ruleId: "rule-id",
      ruleName: "Team Mail",
      wasEnabled: true,
    });
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });

  it("blocks deleting default rules", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-id",
      name: "To Reply",
      enabled: true,
      systemType: SystemType.TO_REPLY,
      updatedAt: new Date("2026-04-27T00:00:00.000Z"),
      emailAccount: { rulesRevision: 3 },
    });

    const result = await updateRuleStateTool({
      email: "user@example.com",
      emailAccountId: "email-account-id",
      logger,
      getRuleReadState: () => ({
        readAt: Date.now(),
        rulesRevision: 3,
        ruleUpdatedAtByName: new Map([
          ["To Reply", "2026-04-27T00:00:00.000Z"],
        ]),
      }),
    }).execute({
      ruleName: "To Reply",
      operation: "delete",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Default rules cannot be deleted");
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });
});
