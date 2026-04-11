import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, GroupItemType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import { createRuleTool } from "./tools/rules/create-rule-tool";

vi.mock("server-only", () => ({}));

const {
  mockCreateRule,
  mockOutboundActionsNeedChatRiskConfirmation,
  mockPrisma,
} = vi.hoisted(() => ({
  mockCreateRule: vi.fn(),
  mockOutboundActionsNeedChatRiskConfirmation: vi.fn(),
  mockPrisma: {
    rule: {
      findMany: vi.fn(),
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
