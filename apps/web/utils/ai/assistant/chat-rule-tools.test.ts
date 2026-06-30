import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionType,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import { createRuleTool } from "./tools/rules/create-rule-tool";
import { updateRuleTool } from "./tools/rules/update-rule-tool";
import { deleteRuleTool } from "./tools/rules/delete-rule-tool";

const {
  mockCreateRule,
  mockOutboundActionsNeedChatRiskConfirmation,
  mockPartialUpdateRule,
  mockPrisma,
  mockSetRuleEnabled,
  mockUpdateRuleActions,
} = vi.hoisted(() => ({
  mockCreateRule: vi.fn(),
  mockOutboundActionsNeedChatRiskConfirmation: vi.fn(),
  mockPartialUpdateRule: vi.fn(),
  mockSetRuleEnabled: vi.fn(),
  mockUpdateRuleActions: vi.fn(),
  mockPrisma: {
    emailAccount: {
      findUnique: vi.fn(),
    },
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
    updateRuleActions: mockUpdateRuleActions,
  };
});

const logger = createTestLogger();

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
    mockAssistantRuleSnapshot([
      {
        name: "Urgent Action Mail",
        instructions: "Only urgent requests from this sender domain.",
        from: "@company.example",
      },
      {
        name: "Vendor Billing",
        instructions: "Updated billing instructions.",
        from: "billing@vendor.example",
        subject: "invoice",
        conditionalOperator: "AND",
      },
    ]);
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

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        ruleId: "new-rule-id",
        currentRule: expect.objectContaining({
          name: "Urgent Action Mail",
        }),
      }),
    );
    expect(mockCreateRule).toHaveBeenCalledOnce();
  });
});

describe("updateRuleTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPartialUpdateRule.mockResolvedValue({ id: "rule-id" });
    mockAssistantRuleSnapshot([
      {
        name: "Vendor Billing",
        instructions: "Updated billing instructions.",
        from: "billing@vendor.example",
        subject: "invoice",
        conditionalOperator: "AND",
      },
    ]);
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
    expect(result.currentRule).toEqual(
      expect.objectContaining({
        name: "Vendor Billing",
        conditions: expect.objectContaining({
          aiInstructions: "Updated billing instructions.",
        }),
      }),
    );
    expect(mockPartialUpdateRule).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: {
        subject: null,
      },
    });
  });

  it("strips copied rule fields from status-only updates before writing", async () => {
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
        name: "Vendor Billing",
        enabled: false,
        condition: {
          aiInstructions: "Billing notices.",
          clearAiInstructions: true,
          static: {
            from: "billing@vendor.example",
            subject: "invoice",
          },
          conditionalOperator: "AND",
        },
        actions: [],
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        updatedEnabled: false,
        updatedName: "Vendor Billing",
        updatedConditions: undefined,
        updatedActions: undefined,
      }),
    );
    expect(mockPartialUpdateRule).not.toHaveBeenCalled();
    expect(mockUpdateRuleActions).not.toHaveBeenCalled();
    expect(mockSetRuleEnabled).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      enabled: false,
    });
  });

  it("returns alreadyApplied without writing when all requested fields match the rule", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue(
      vendorBillingRuleWithActions(),
    );

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
        name: "Vendor Billing",
        condition: {
          aiInstructions: "Billing notices.",
          static: {
            from: "billing@vendor.example",
            subject: "invoice",
          },
          conditionalOperator: "AND",
        },
        actions: vendorBillingActionsInput(),
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        alreadyApplied: true,
        currentRule: expect.objectContaining({
          name: "Vendor Billing",
        }),
      }),
    );
    expect(mockPartialUpdateRule).not.toHaveBeenCalled();
    expect(mockUpdateRuleActions).not.toHaveBeenCalled();
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });

  it("strips copied actions while applying a real condition change", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue(
      vendorBillingRuleWithActions(),
    );

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
          aiInstructions: "Billing notices that need finance review.",
        },
        actions: vendorBillingActionsInput(),
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        updatedConditions: {
          aiInstructions: "Billing notices that need finance review.",
        },
        updatedActions: undefined,
      }),
    );
    expect(result.alreadyApplied).toBeUndefined();
    expect(mockPartialUpdateRule).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: {
        instructions: "Billing notices that need finance review.",
      },
    });
    expect(mockUpdateRuleActions).not.toHaveBeenCalled();
  });

  it("applies static condition changes when copied instructions are included", async () => {
    mockPrisma.rule.findUnique.mockResolvedValue(
      vendorBillingRuleWithActions(),
    );

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
          aiInstructions: "Billing notices.",
          static: {
            from: "accounts@vendor.example",
            subject: "invoice",
          },
          conditionalOperator: "AND",
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        updatedConditions: {
          aiInstructions: "Billing notices.",
          static: {
            from: "accounts@vendor.example",
            subject: "invoice",
          },
          conditionalOperator: "AND",
        },
      }),
    );
    expect(result.alreadyApplied).toBeUndefined();
    expect(mockPartialUpdateRule).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: {
        instructions: "Billing notices.",
        from: "accounts@vendor.example",
        subject: "invoice",
        conditionalOperator: "AND",
      },
    });
  });

  it("blocks updates after deletion is pending for the same rule", async () => {
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
      hasPendingRuleDeletion: (ruleName) => ruleName === "Vendor Billing",
    }).execute({
      ruleName: "Vendor Billing",
      updates: {
        enabled: false,
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Deletion is already pending");
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });

  it("keeps replacement AI instructions when clear flag is also present", async () => {
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
          aiInstructions: "Updated billing instructions.",
          clearAiInstructions: true,
        },
      },
    });

    expect(result.success).toBe(true);
    expect(mockPartialUpdateRule).toHaveBeenCalledWith({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: {
        instructions: "Updated billing instructions.",
      },
    });
  });
});

describe("deleteRuleTool", () => {
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

  it("returns a pending confirmation for deleting a custom rule", async () => {
    const result = await deleteRuleTool({
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

    const result = await deleteRuleTool({
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
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Default rules cannot be deleted");
    expect(mockSetRuleEnabled).not.toHaveBeenCalled();
  });
});

function mockAssistantRuleSnapshot(
  rules: Array<{
    name: string;
    instructions: string | null;
    from: string | null;
    subject?: string | null;
    conditionalOperator?: "AND" | "OR" | null;
  }>,
) {
  mockPrisma.emailAccount.findUnique.mockResolvedValue({
    about: null,
    rulesRevision: 4,
    rules: rules.map((rule) => ({
      name: rule.name,
      instructions: rule.instructions,
      updatedAt: new Date("2026-04-27T00:01:00.000Z"),
      from: rule.from,
      to: null,
      subject: rule.subject ?? null,
      conditionalOperator: rule.conditionalOperator ?? null,
      enabled: true,
      runOnThreads: true,
      actions: [],
    })),
    messagingChannels: [],
  });
}

function vendorBillingRuleWithActions() {
  return {
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
    actions: [
      {
        type: ActionType.LABEL,
        content: null,
        label: "Vendor Billing",
        to: null,
        cc: null,
        bcc: null,
        subject: null,
        url: null,
        folderName: null,
        delayInMinutes: null,
      },
      {
        type: ActionType.ARCHIVE,
        content: null,
        label: null,
        to: null,
        cc: null,
        bcc: null,
        subject: null,
        url: null,
        folderName: null,
        delayInMinutes: null,
      },
    ],
  };
}

function vendorBillingActionsInput() {
  return [
    {
      type: ActionType.LABEL,
      fields: { label: "Vendor Billing" },
      delayInMinutes: null,
    },
    {
      type: ActionType.ARCHIVE,
      fields: {},
      delayInMinutes: null,
    },
  ];
}
