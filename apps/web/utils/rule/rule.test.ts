import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { ActionType, GroupItemType } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import { WEBHOOK_ACTION_DISABLED_MESSAGE } from "@/utils/webhook-action";
import { getActionRiskLevel } from "@/utils/risk";

const { createRuleHistoryMock, mockEnv } = vi.hoisted(() => ({
  createRuleHistoryMock: vi.fn(),
  mockEnv: {
    webhookActionsEnabled: true,
  },
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/risk", () => ({
  getActionRiskLevel: vi.fn(),
}));
vi.mock("@/app/(app)/[emailAccountId]/assistant/examples", () => ({
  hasExampleParams: vi.fn(() => false),
}));
vi.mock("@/utils/rule/rule-history", () => ({
  createRuleHistory: createRuleHistoryMock,
  ruleHistoryRuleInclude: { actions: true, group: true },
}));
vi.mock("@/utils/email/provider-types", () => ({
  isMicrosoftProvider: vi.fn(() => false),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/label/resolve-label", () => ({
  resolveLabelNameAndId: vi.fn(),
}));
vi.mock("@/utils/rule/recipient-validation", () => ({
  getMissingRecipientMessage: vi.fn(),
}));
vi.mock("@/utils/prisma-helpers", () => ({
  isDuplicateError: vi.fn(() => false),
}));
vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED() {
      return mockEnv.webhookActionsEnabled;
    },
  },
}));

import {
  createRule,
  createRuleWithResolvedActions,
  deleteRule,
  partialUpdateRule,
  replaceRuleWithResolvedActions,
  setRuleEnabled,
  setRuleRunOnThreads,
  updateRule,
  updateRuleInstructions,
  updateRuleActions,
} from "./rule";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

describe("deleteRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.webhookActionsEnabled = true;
    vi.mocked(getActionRiskLevel).mockReturnValue({
      level: "low",
      message: "safe",
    });
    prisma.rule.findMany.mockResolvedValue([]);
  });

  it("deletes the group first and relies on cascade delete for grouped rules", async () => {
    prisma.group.deleteMany.mockResolvedValue({ count: 1 });

    await deleteRule({
      emailAccountId: "email-account-id",
      ruleId: "rule-id",
      groupId: "group-id",
    });

    expect(prisma.group.deleteMany).toHaveBeenCalledWith({
      where: { id: "group-id", emailAccountId: "email-account-id" },
    });
    expect(prisma.rule.delete).not.toHaveBeenCalled();
    expect(createRuleHistoryMock).not.toHaveBeenCalled();
  });

  it("falls back to deleting the rule when the group is already gone", async () => {
    prisma.group.deleteMany.mockResolvedValue({ count: 0 });
    prisma.rule.delete.mockResolvedValue({ id: "rule-id" } as any);

    await deleteRule({
      emailAccountId: "email-account-id",
      ruleId: "rule-id",
      groupId: "group-id",
    });

    expect(prisma.group.deleteMany).toHaveBeenCalledWith({
      where: { id: "group-id", emailAccountId: "email-account-id" },
    });
    expect(prisma.rule.delete).toHaveBeenCalledWith({
      where: { id: "rule-id", emailAccountId: "email-account-id" },
    });
    expect(createRuleHistoryMock).not.toHaveBeenCalled();
  });

  it("deletes the rule directly when there is no group", async () => {
    prisma.rule.delete.mockResolvedValue({ id: "rule-id" } as any);

    await deleteRule({
      emailAccountId: "email-account-id",
      ruleId: "rule-id",
      groupId: null,
    });

    expect(prisma.group.deleteMany).not.toHaveBeenCalled();
    expect(prisma.rule.delete).toHaveBeenCalledWith({
      where: { id: "rule-id", emailAccountId: "email-account-id" },
    });
    expect(createRuleHistoryMock).not.toHaveBeenCalled();
  });
});

describe("outbound action guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.webhookActionsEnabled = true;
    vi.mocked(getActionRiskLevel).mockReturnValue({
      level: "low",
      message: "safe",
    });
    prisma.rule.findMany.mockResolvedValue([]);
  });

  it("rejects creating a low-trust from rule with FORWARD", async () => {
    await expect(
      createRule({
        result: {
          name: "Forward rule",
          condition: {
            aiInstructions: null,
            conditionalOperator: null,
            static: {
              from: "Team *",
              to: null,
              subject: null,
            },
          },
          actions: [
            {
              type: ActionType.FORWARD,
              fields: {
                to: "forward@example.com",
              } as any,
              delayInMinutes: null,
            },
            {
              type: ActionType.LABEL,
              fields: {
                label: "Important",
              } as any,
              delayInMinutes: null,
            },
          ],
        },
        emailAccountId: "email-account-id",
        provider: "gmail",
        runOnThreads: true,
        logger,
      }),
    ).rejects.toThrow("email- or domain-based From condition");

    expect(prisma.rule.create).not.toHaveBeenCalled();
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("rejects creating a duplicate sender-only rule", async () => {
    prisma.rule.findMany.mockResolvedValue([
      {
        name: "Existing sender rule",
        instructions: null,
        from: "sender@example.com",
        to: null,
        subject: null,
        body: null,
        group: {
          items: [
            {
              value: "sender@example.com",
              exclude: false,
              type: GroupItemType.FROM,
            },
          ],
        },
      },
    ] as any);
    prisma.rule.create.mockResolvedValue({
      id: "new-rule-id",
      actions: [],
      group: null,
    } as any);

    await expect(
      createRule({
        result: {
          name: "Duplicate sender rule",
          condition: {
            aiInstructions: null,
            conditionalOperator: null,
            static: {
              from: "sender@example.com",
              to: null,
              subject: null,
            },
          },
          actions: [
            {
              type: ActionType.ARCHIVE,
              fields: null,
              delayInMinutes: null,
            },
          ],
        },
        emailAccountId: "email-account-id",
        provider: "gmail",
        runOnThreads: true,
        logger,
      }),
    ).rejects.toThrow(
      'Cannot create this rule because it overlaps the existing "Existing sender rule" rule',
    );

    expect(prisma.rule.create).not.toHaveBeenCalled();
  });

  it("allows sender-only rules when an overlapping existing rule is grouped", async () => {
    const existingGroupedRule = {
      name: "Existing grouped rule",
      instructions: null,
      from: "@example.com",
      to: null,
      subject: null,
      body: null,
      groupId: "group-id",
      group: { items: [] },
    };

    prisma.rule.findMany.mockImplementation(async (args) => {
      const select = (args as { select?: Record<string, unknown> }).select;

      return [
        {
          name: existingGroupedRule.name,
          instructions: existingGroupedRule.instructions,
          from: existingGroupedRule.from,
          to: existingGroupedRule.to,
          subject: existingGroupedRule.subject,
          body: existingGroupedRule.body,
          groupId: select?.groupId ? existingGroupedRule.groupId : undefined,
          group: existingGroupedRule.group,
        },
      ] as never;
    });
    prisma.rule.create.mockResolvedValue({
      id: "new-rule-id",
      actions: [],
      group: null,
    } as any);

    await expect(
      createRule({
        result: {
          name: "New sender rule",
          condition: {
            aiInstructions: null,
            conditionalOperator: null,
            static: {
              from: "sender@example.com",
              to: null,
              subject: null,
            },
          },
          actions: [
            {
              type: ActionType.ARCHIVE,
              fields: null,
              delayInMinutes: null,
            },
          ],
        },
        emailAccountId: "email-account-id",
        provider: "gmail",
        runOnThreads: true,
        logger,
      }),
    ).resolves.toMatchObject({ id: "new-rule-id" });

    expect(prisma.rule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ groupId: true }),
      }),
    );
    expect(prisma.rule.create).toHaveBeenCalled();
  });

  it("rejects updating a low-trust from rule before mapping action fields", async () => {
    await expect(
      updateRule({
        ruleId: "rule-id",
        result: {
          name: "Forward rule",
          condition: {
            aiInstructions: null,
            conditionalOperator: null,
            static: {
              from: "Team *",
              to: null,
              subject: null,
            },
          },
          actions: [
            {
              type: ActionType.FORWARD,
              fields: {
                to: "forward@example.com",
              } as any,
              delayInMinutes: null,
            },
            {
              type: ActionType.LABEL,
              fields: {
                label: "Important",
              } as any,
              delayInMinutes: null,
            },
          ],
        },
        emailAccountId: "email-account-id",
        provider: "gmail",
        logger,
      }),
    ).rejects.toThrow("email- or domain-based From condition");

    expect(prisma.rule.update).not.toHaveBeenCalled();
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("rejects updating actions to FORWARD on an existing low-trust from rule", async () => {
    prisma.rule.findFirst.mockResolvedValue({
      from: "Team *",
    } as any);

    await expect(
      updateRuleActions({
        ruleId: "rule-id",
        actions: [
          {
            type: ActionType.FORWARD,
            fields: {
              to: "forward@example.com",
            } as any,
            delayInMinutes: null,
          },
        ],
        provider: "gmail",
        emailAccountId: "email-account-id",
        logger,
      }),
    ).rejects.toThrow("email- or domain-based From condition");

    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it("rejects updating actions when the scoped rule is missing", async () => {
    prisma.rule.findFirst.mockResolvedValue(null);

    await expect(
      updateRuleActions({
        ruleId: "rule-id",
        actions: [
          {
            type: ActionType.FORWARD,
            fields: {
              to: "forward@example.com",
            } as any,
            delayInMinutes: null,
          },
        ],
        provider: "gmail",
        emailAccountId: "email-account-id",
        logger,
      }),
    ).rejects.toThrow("Rule not found");

    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it("adds action ownership fields when updating messaging actions", async () => {
    prisma.rule.findFirst.mockResolvedValue({
      from: null,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([
      { id: "cmessagingchannel1234567890123" },
    ] as any);
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      actions: [],
    } as any);

    await updateRuleActions({
      ruleId: "rule-id",
      actions: [
        {
          type: ActionType.NOTIFY_MESSAGING_CHANNEL,
          messagingChannelId: "cmessagingchannel1234567890123",
          fields: null,
          delayInMinutes: null,
        } as any,
      ],
      provider: "gmail",
      emailAccountId: "email-account-id",
      logger,
    });

    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: "rule-id", emailAccountId: "email-account-id" },
      data: {
        actions: {
          deleteMany: {},
          createMany: {
            data: [
              expect.objectContaining({
                type: ActionType.NOTIFY_MESSAGING_CHANNEL,
                messagingChannelId: "cmessagingchannel1234567890123",
                messagingChannelEmailAccountId: "email-account-id",
              }),
            ],
          },
        },
      },
      include: { actions: true, group: true },
    });
    expect(createRuleHistoryMock).toHaveBeenCalledWith({
      rule: expect.objectContaining({ id: "rule-id" }),
      triggerType: "actions_updated",
    });
  });

  it("keeps nested rule action writes free of emailAccountId", async () => {
    prisma.rule.create.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);

    await createRuleWithResolvedActions({
      emailAccountId: "email-account-id",
      data: { name: "Messaging rule" },
      actions: [
        {
          type: ActionType.NOTIFY_MESSAGING_CHANNEL,
          messagingChannelId: "cmessagingchannel1234567890123",
        },
      ],
    });

    const createArgs = prisma.rule.create.mock.calls[0]?.[0];
    const actionData = createArgs?.data.actions.createMany.data?.[0];

    expect(actionData).toMatchObject({
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      messagingChannelId: "cmessagingchannel1234567890123",
      messagingChannelEmailAccountId: "email-account-id",
    });
    expect(actionData).not.toHaveProperty("emailAccountId");
  });

  it("scopes full rule updates to the email account", async () => {
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);

    await updateRule({
      ruleId: "rule-id",
      result: {
        name: "Archive rule",
        condition: {
          aiInstructions: null,
          conditionalOperator: null,
          static: {
            from: "sender@example.com",
            to: null,
            subject: null,
          },
        },
        actions: [
          {
            type: ActionType.ARCHIVE,
            fields: null,
            delayInMinutes: null,
          },
        ],
      },
      emailAccountId: "email-account-id",
      provider: "gmail",
      logger,
    });

    expect(prisma.rule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rule-id", emailAccountId: "email-account-id" },
      }),
    );
  });

  it("scopes partial rule updates to the email account", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      instructions: "old instructions",
      from: null,
      to: null,
      subject: null,
      body: null,
      groupId: null,
    } as any);
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);

    await partialUpdateRule({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: { instructions: "updated instructions" } as any,
    });

    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: "rule-id", emailAccountId: "email-account-id" },
      data: { instructions: "updated instructions" },
      include: { actions: true, group: true },
    });
    expect(createRuleHistoryMock).toHaveBeenCalledWith({
      rule: expect.objectContaining({ id: "rule-id" }),
      triggerType: "conditions_updated",
    });
  });

  it("rejects creating webhook rules when webhook actions are disabled", async () => {
    mockEnv.webhookActionsEnabled = false;

    await expect(
      createRule({
        result: {
          name: "Webhook rule",
          condition: {
            aiInstructions: "Match these emails",
            conditionalOperator: null,
            static: null,
          },
          actions: [
            {
              type: ActionType.CALL_WEBHOOK,
              fields: {
                webhookUrl: "https://example.com/webhook",
              } as any,
              delayInMinutes: null,
            },
          ],
        },
        emailAccountId: "email-account-id",
        provider: "gmail",
        runOnThreads: true,
        logger,
      }),
    ).rejects.toThrow(WEBHOOK_ACTION_DISABLED_MESSAGE);

    expect(prisma.rule.create).not.toHaveBeenCalled();
    expect(createEmailProvider).not.toHaveBeenCalled();
  });
});

describe("replaceRuleWithResolvedActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.webhookActionsEnabled = true;
    vi.mocked(getActionRiskLevel).mockReturnValue({
      level: "low",
      message: "safe",
    });
    prisma.rule.findMany.mockResolvedValue([]);
  });

  it("deletes the previous learned pattern group when the rule is detached from it", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      groupId: "old-group-id",
    } as any);
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      groupId: null,
      actions: [],
      group: null,
    } as any);
    prisma.group.deleteMany.mockResolvedValue({ count: 1 });

    await replaceRuleWithResolvedActions({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: { groupId: null },
      actions: [],
    });

    expect(prisma.rule.findUnique).toHaveBeenCalledWith({
      where: { id: "rule-id", emailAccountId: "email-account-id" },
      select: expect.objectContaining({ groupId: true }),
    });
    expect(prisma.group.deleteMany).toHaveBeenCalledWith({
      where: { id: "old-group-id", emailAccountId: "email-account-id" },
    });
  });

  it("keeps the learned pattern group when it is unchanged", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      groupId: "group-id",
    } as any);
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      groupId: "group-id",
      actions: [],
      group: { id: "group-id" },
    } as any);

    await replaceRuleWithResolvedActions({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      data: { groupId: "group-id" },
      actions: [],
    });

    expect(prisma.group.deleteMany).not.toHaveBeenCalled();
  });
});

describe("rule history snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.webhookActionsEnabled = true;
    vi.mocked(getActionRiskLevel).mockReturnValue({
      level: "low",
      message: "safe",
    });
    prisma.rule.findMany.mockResolvedValue([]);
  });

  it("writes history when updating instructions", async () => {
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);

    await updateRuleInstructions({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      instructions: "updated instructions",
    });

    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: "rule-id", emailAccountId: "email-account-id" },
      data: { instructions: "updated instructions" },
      include: { actions: true, group: true },
    });
    expect(createRuleHistoryMock).toHaveBeenCalledWith({
      rule: expect.objectContaining({ id: "rule-id" }),
      triggerType: "instructions_updated",
    });
  });

  it("writes history when toggling rule enablement", async () => {
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);

    await setRuleEnabled({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      enabled: false,
    });

    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: "rule-id", emailAccountId: "email-account-id" },
      data: { enabled: false },
      include: { actions: true, group: true },
    });
    expect(createRuleHistoryMock).toHaveBeenCalledWith({
      rule: expect.objectContaining({ id: "rule-id" }),
      triggerType: "enabled_updated",
    });
  });

  it("writes history when changing thread execution mode", async () => {
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);

    await setRuleRunOnThreads({
      ruleId: "rule-id",
      emailAccountId: "email-account-id",
      runOnThreads: false,
    });

    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: "rule-id", emailAccountId: "email-account-id" },
      data: { runOnThreads: false },
      include: { actions: true, group: true },
    });
    expect(createRuleHistoryMock).toHaveBeenCalledWith({
      rule: expect.objectContaining({ id: "rule-id" }),
      triggerType: "run_on_threads_updated",
    });
  });
});

describe("webhook URL validation at save time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.webhookActionsEnabled = true;
  });

  it("rejects creating a rule with a localhost webhook URL", async () => {
    await expect(
      createRuleWithResolvedActions({
        emailAccountId: "email-account-id",
        data: { name: "Webhook rule" },
        actions: [
          { type: ActionType.CALL_WEBHOOK, url: "https://localhost/hook" },
        ],
      }),
    ).rejects.toThrow("Invalid webhook URL");

    expect(prisma.rule.create).not.toHaveBeenCalled();
  });

  it("rejects creating a rule with a private IP webhook URL", async () => {
    await expect(
      createRuleWithResolvedActions({
        emailAccountId: "email-account-id",
        data: { name: "Webhook rule" },
        actions: [
          {
            type: ActionType.CALL_WEBHOOK,
            url: "https://169.254.169.254/metadata",
          },
        ],
      }),
    ).rejects.toThrow("Invalid webhook URL");

    expect(prisma.rule.create).not.toHaveBeenCalled();
  });

  it("rejects creating a rule with a non-http scheme webhook URL", async () => {
    await expect(
      createRuleWithResolvedActions({
        emailAccountId: "email-account-id",
        data: { name: "Webhook rule" },
        actions: [{ type: ActionType.CALL_WEBHOOK, url: "file:///etc/passwd" }],
      }),
    ).rejects.toThrow("Invalid webhook URL");

    expect(prisma.rule.create).not.toHaveBeenCalled();
  });

  it("rejects updating a rule with an internal webhook URL", async () => {
    await expect(
      replaceRuleWithResolvedActions({
        ruleId: "rule-id",
        emailAccountId: "email-account-id",
        data: {},
        actions: [
          {
            type: ActionType.CALL_WEBHOOK,
            url: "https://metadata.google.internal/computeMetadata/v1/",
          },
        ],
      }),
    ).rejects.toThrow("Invalid webhook URL");

    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it("rejects updating assistant actions with an internal webhook URL", async () => {
    prisma.rule.findFirst.mockResolvedValue({
      from: null,
    } as any);

    await expect(
      updateRuleActions({
        ruleId: "rule-id",
        actions: [
          {
            type: ActionType.CALL_WEBHOOK,
            fields: {
              webhookUrl:
                "https://metadata.google.internal/computeMetadata/v1/",
            } as any,
            delayInMinutes: null,
          },
        ],
        provider: "gmail",
        emailAccountId: "email-account-id",
        logger,
      }),
    ).rejects.toThrow("Invalid webhook URL");

    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it("allows a valid public webhook URL", async () => {
    prisma.rule.create.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);

    await createRuleWithResolvedActions({
      emailAccountId: "email-account-id",
      data: { name: "Webhook rule" },
      actions: [
        { type: ActionType.CALL_WEBHOOK, url: "https://example.com/webhook" },
      ],
    });

    expect(prisma.rule.create).toHaveBeenCalled();
  });

  it("skips validation for non-webhook actions", async () => {
    prisma.rule.create.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);

    await createRuleWithResolvedActions({
      emailAccountId: "email-account-id",
      data: { name: "Archive rule" },
      actions: [{ type: ActionType.ARCHIVE }],
    });

    expect(prisma.rule.create).toHaveBeenCalled();
  });
});

describe("draft messaging actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActionRiskLevel).mockReturnValue({
      level: "low",
      message: "safe",
    });
  });

  it("rejects creating a draft messaging rule with a channel from another account", async () => {
    prisma.rule.create.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([] as any);

    await expect(
      createRule({
        result: {
          name: "To Reply",
          condition: {
            aiInstructions: null,
            conditionalOperator: null,
            static: {
              from: null,
              to: null,
              subject: null,
            },
          },
          actions: [
            {
              type: ActionType.DRAFT_MESSAGING_CHANNEL,
              messagingChannelId: "cmessagingchannel1234567890123",
              fields: {
                content: "",
              } as any,
              delayInMinutes: null,
            },
          ],
        },
        emailAccountId: "email-account-id",
        provider: "gmail",
        runOnThreads: true,
        logger,
      }),
    ).rejects.toThrow("Messaging channel not found");

    expect(prisma.rule.create).not.toHaveBeenCalled();
  });

  it("rejects updating a draft messaging rule with a channel from another account", async () => {
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([] as any);

    await expect(
      updateRule({
        ruleId: "rule-id",
        result: {
          name: "To Reply",
          condition: {
            aiInstructions: null,
            conditionalOperator: null,
            static: {
              from: null,
              to: null,
              subject: null,
            },
          },
          actions: [
            {
              type: ActionType.DRAFT_MESSAGING_CHANNEL,
              messagingChannelId: "cmessagingchannel1234567890123",
              fields: {
                content: "",
              } as any,
              delayInMinutes: null,
            },
          ],
        },
        emailAccountId: "email-account-id",
        provider: "gmail",
        logger,
      }),
    ).rejects.toThrow("Messaging channel not found");

    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it("preserves messagingChannelId when updating a draft messaging rule", async () => {
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "cmessagingchannel1234567890123",
      },
    ] as any);

    await updateRule({
      ruleId: "rule-id",
      result: {
        name: "To Reply",
        condition: {
          aiInstructions: null,
          conditionalOperator: null,
          static: {
            from: null,
            to: null,
            subject: null,
          },
        },
        actions: [
          {
            type: ActionType.DRAFT_MESSAGING_CHANNEL,
            messagingChannelId: "cmessagingchannel1234567890123",
            fields: {
              content: "",
            } as any,
            delayInMinutes: null,
          },
        ],
      },
      emailAccountId: "email-account-id",
      provider: "gmail",
      logger,
    });

    expect(prisma.rule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actions: {
            deleteMany: {},
            createMany: {
              data: [
                expect.objectContaining({
                  type: ActionType.DRAFT_MESSAGING_CHANNEL,
                  messagingChannelId: "cmessagingchannel1234567890123",
                }),
              ],
            },
          },
        }),
      }),
    );
  });
});
