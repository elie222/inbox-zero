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
const EMAIL_ACCOUNT_ID = "email-account-id";
const RULE_ID = "rule-id";
const GROUP_ID = "group-id";
const MESSAGING_CHANNEL_ID = "cmessagingchannel1234567890123";

type RuleResult = Parameters<typeof createRule>[0]["result"];
type RuleAction = RuleResult["actions"][number];
type ResolvedRuleAction = Parameters<
  typeof createRuleWithResolvedActions
>[0]["actions"][number];

describe("deleteRule", () => {
  beforeEach(resetRuleMocks);

  it("deletes the group first and relies on cascade delete for grouped rules", async () => {
    prisma.group.deleteMany.mockResolvedValue({ count: 1 });

    await deleteRule({
      emailAccountId: EMAIL_ACCOUNT_ID,
      ruleId: RULE_ID,
      groupId: GROUP_ID,
    });

    expect(prisma.group.deleteMany).toHaveBeenCalledWith({
      where: { id: GROUP_ID, emailAccountId: EMAIL_ACCOUNT_ID },
    });
    expect(prisma.rule.delete).not.toHaveBeenCalled();
    expect(createRuleHistoryMock).not.toHaveBeenCalled();
  });

  it("falls back to deleting the rule when the group is already gone", async () => {
    prisma.group.deleteMany.mockResolvedValue({ count: 0 });
    prisma.rule.delete.mockResolvedValue({ id: RULE_ID } as any);

    await deleteRule({
      emailAccountId: EMAIL_ACCOUNT_ID,
      ruleId: RULE_ID,
      groupId: GROUP_ID,
    });

    expect(prisma.group.deleteMany).toHaveBeenCalledWith({
      where: { id: GROUP_ID, emailAccountId: EMAIL_ACCOUNT_ID },
    });
    expect(prisma.rule.delete).toHaveBeenCalledWith({
      where: { id: RULE_ID, emailAccountId: EMAIL_ACCOUNT_ID },
    });
    expect(createRuleHistoryMock).not.toHaveBeenCalled();
  });

  it("deletes the rule directly when there is no group", async () => {
    prisma.rule.delete.mockResolvedValue({ id: RULE_ID } as any);

    await deleteRule({
      emailAccountId: EMAIL_ACCOUNT_ID,
      ruleId: RULE_ID,
      groupId: null,
    });

    expect(prisma.group.deleteMany).not.toHaveBeenCalled();
    expect(prisma.rule.delete).toHaveBeenCalledWith({
      where: { id: RULE_ID, emailAccountId: EMAIL_ACCOUNT_ID },
    });
    expect(createRuleHistoryMock).not.toHaveBeenCalled();
  });
});

describe("outbound action guardrails", () => {
  beforeEach(resetRuleMocks);

  it("rejects creating a low-trust from rule with FORWARD", async () => {
    await expect(
      createRule({
        result: createRuleResult({
          name: "Forward rule",
          from: "Team *",
          actions: [forwardAction(), labelAction()],
        }),
        emailAccountId: EMAIL_ACCOUNT_ID,
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
        result: createRuleResult({
          name: "Duplicate sender rule",
          from: "sender@example.com",
          actions: [archiveAction()],
        }),
        emailAccountId: EMAIL_ACCOUNT_ID,
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
        result: createRuleResult({
          name: "New sender rule",
          from: "sender@example.com",
          actions: [archiveAction()],
        }),
        emailAccountId: EMAIL_ACCOUNT_ID,
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
        ruleId: RULE_ID,
        result: createRuleResult({
          name: "Forward rule",
          from: "Team *",
          actions: [forwardAction(), labelAction()],
        }),
        emailAccountId: EMAIL_ACCOUNT_ID,
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
        ruleId: RULE_ID,
        actions: [forwardAction()],
        provider: "gmail",
        emailAccountId: EMAIL_ACCOUNT_ID,
        logger,
      }),
    ).rejects.toThrow("email- or domain-based From condition");

    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it("rejects updating actions when the scoped rule is missing", async () => {
    prisma.rule.findFirst.mockResolvedValue(null);

    await expect(
      updateRuleActions({
        ruleId: RULE_ID,
        actions: [forwardAction()],
        provider: "gmail",
        emailAccountId: EMAIL_ACCOUNT_ID,
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
      { id: MESSAGING_CHANNEL_ID },
    ] as any);
    prisma.rule.update.mockResolvedValue({
      id: RULE_ID,
      actions: [],
    } as any);

    await updateRuleActions({
      ruleId: RULE_ID,
      actions: [notifyMessagingChannelAction()],
      provider: "gmail",
      emailAccountId: EMAIL_ACCOUNT_ID,
      logger,
    });

    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: RULE_ID, emailAccountId: EMAIL_ACCOUNT_ID },
      data: {
        actions: {
          deleteMany: {},
          createMany: {
            data: [
              expect.objectContaining({
                type: ActionType.NOTIFY_MESSAGING_CHANNEL,
                messagingChannelId: MESSAGING_CHANNEL_ID,
                messagingChannelEmailAccountId: EMAIL_ACCOUNT_ID,
              }),
            ],
          },
        },
      },
      include: { actions: true, group: true },
    });
    expect(createRuleHistoryMock).toHaveBeenCalledWith({
      rule: expect.objectContaining({ id: RULE_ID }),
      triggerType: "actions_updated",
    });
  });

  it("keeps nested rule action writes free of emailAccountId", async () => {
    prisma.rule.create.mockResolvedValue({
      id: RULE_ID,
      actions: [],
      group: null,
    } as any);

    await createRuleWithResolvedActions({
      emailAccountId: EMAIL_ACCOUNT_ID,
      data: { name: "Messaging rule" },
      actions: [resolvedNotifyMessagingChannelAction()],
    });

    const createArgs = prisma.rule.create.mock.calls[0]?.[0];
    const actionData = createArgs?.data.actions.createMany.data?.[0];

    expect(actionData).toMatchObject({
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      messagingChannelId: MESSAGING_CHANNEL_ID,
      messagingChannelEmailAccountId: EMAIL_ACCOUNT_ID,
    });
    expect(actionData).not.toHaveProperty("emailAccountId");
  });

  it("scopes full rule updates to the email account", async () => {
    prisma.rule.update.mockResolvedValue({
      id: RULE_ID,
      actions: [],
      group: null,
    } as any);

    await updateRule({
      ruleId: RULE_ID,
      result: createRuleResult({
        name: "Archive rule",
        from: "sender@example.com",
        actions: [archiveAction()],
      }),
      emailAccountId: EMAIL_ACCOUNT_ID,
      provider: "gmail",
      logger,
    });

    expect(prisma.rule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RULE_ID, emailAccountId: EMAIL_ACCOUNT_ID },
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
      id: RULE_ID,
      actions: [],
      group: null,
    } as any);

    await partialUpdateRule({
      ruleId: RULE_ID,
      emailAccountId: EMAIL_ACCOUNT_ID,
      data: { instructions: "updated instructions" } as any,
    });

    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: RULE_ID, emailAccountId: EMAIL_ACCOUNT_ID },
      data: { instructions: "updated instructions" },
      include: { actions: true, group: true },
    });
    expect(createRuleHistoryMock).toHaveBeenCalledWith({
      rule: expect.objectContaining({ id: RULE_ID }),
      triggerType: "conditions_updated",
    });
  });

  it("rejects creating webhook rules when webhook actions are disabled", async () => {
    mockEnv.webhookActionsEnabled = false;

    await expect(
      createRule({
        result: createRuleResult({
          name: "Webhook rule",
          aiInstructions: "Match these emails",
          staticCondition: null,
          actions: [webhookRuleAction("https://example.com/webhook")],
        }),
        emailAccountId: EMAIL_ACCOUNT_ID,
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
  beforeEach(resetRuleMocks);

  it("deletes the previous learned pattern group when the rule is detached from it", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      groupId: "old-group-id",
    } as any);
    prisma.rule.update.mockResolvedValue({
      id: RULE_ID,
      groupId: null,
      actions: [],
      group: null,
    } as any);
    prisma.group.deleteMany.mockResolvedValue({ count: 1 });

    await replaceRuleWithResolvedActions({
      ruleId: RULE_ID,
      emailAccountId: EMAIL_ACCOUNT_ID,
      data: { groupId: null },
      actions: [],
    });

    expect(prisma.rule.findUnique).toHaveBeenCalledWith({
      where: { id: RULE_ID, emailAccountId: EMAIL_ACCOUNT_ID },
      select: expect.objectContaining({ groupId: true }),
    });
    expect(prisma.group.deleteMany).toHaveBeenCalledWith({
      where: { id: "old-group-id", emailAccountId: EMAIL_ACCOUNT_ID },
    });
  });

  it("keeps the learned pattern group when it is unchanged", async () => {
    prisma.rule.findUnique.mockResolvedValue({
      groupId: "group-id",
    } as any);
    prisma.rule.update.mockResolvedValue({
      id: RULE_ID,
      groupId: "group-id",
      actions: [],
      group: { id: "group-id" },
    } as any);

    await replaceRuleWithResolvedActions({
      ruleId: RULE_ID,
      emailAccountId: EMAIL_ACCOUNT_ID,
      data: { groupId: "group-id" },
      actions: [],
    });

    expect(prisma.group.deleteMany).not.toHaveBeenCalled();
  });
});

describe("rule history snapshots", () => {
  beforeEach(resetRuleMocks);

  it.each([
    {
      name: "updating instructions",
      data: { instructions: "updated instructions" },
      triggerType: "instructions_updated",
      run: () =>
        updateRuleInstructions({
          ruleId: RULE_ID,
          emailAccountId: EMAIL_ACCOUNT_ID,
          instructions: "updated instructions",
        }),
    },
    {
      name: "toggling rule enablement",
      data: { enabled: false },
      triggerType: "enabled_updated",
      run: () =>
        setRuleEnabled({
          ruleId: RULE_ID,
          emailAccountId: EMAIL_ACCOUNT_ID,
          enabled: false,
        }),
    },
    {
      name: "changing thread execution mode",
      data: { runOnThreads: false },
      triggerType: "run_on_threads_updated",
      run: () =>
        setRuleRunOnThreads({
          ruleId: RULE_ID,
          emailAccountId: EMAIL_ACCOUNT_ID,
          runOnThreads: false,
        }),
    },
  ])("writes history when $name", async ({ data, triggerType, run }) => {
    prisma.rule.update.mockResolvedValue({
      id: RULE_ID,
      actions: [],
      group: null,
    } as any);

    await run();

    expect(prisma.rule.update).toHaveBeenCalledWith({
      where: { id: RULE_ID, emailAccountId: EMAIL_ACCOUNT_ID },
      data,
      include: { actions: true, group: true },
    });
    expect(createRuleHistoryMock).toHaveBeenCalledWith({
      rule: expect.objectContaining({ id: RULE_ID }),
      triggerType,
    });
  });
});

describe("webhook URL validation at save time", () => {
  beforeEach(resetRuleMocks);

  it.each([
    { name: "localhost", url: "https://localhost/hook" },
    { name: "private IP", url: "https://169.254.169.254/metadata" },
    { name: "non-http scheme", url: "file:///etc/passwd" },
  ])("rejects creating a rule with a $name webhook URL", async ({ url }) => {
    await expect(
      createRuleWithResolvedActions({
        emailAccountId: EMAIL_ACCOUNT_ID,
        data: { name: "Webhook rule" },
        actions: [resolvedWebhookAction(url)],
      }),
    ).rejects.toThrow("Invalid webhook URL");

    expect(prisma.rule.create).not.toHaveBeenCalled();
  });

  it("rejects updating a rule with an internal webhook URL", async () => {
    await expect(
      replaceRuleWithResolvedActions({
        ruleId: RULE_ID,
        emailAccountId: EMAIL_ACCOUNT_ID,
        data: {},
        actions: [
          resolvedWebhookAction(
            "https://metadata.google.internal/computeMetadata/v1/",
          ),
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
        ruleId: RULE_ID,
        actions: [
          webhookRuleAction(
            "https://metadata.google.internal/computeMetadata/v1/",
          ),
        ],
        provider: "gmail",
        emailAccountId: EMAIL_ACCOUNT_ID,
        logger,
      }),
    ).rejects.toThrow("Invalid webhook URL");

    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it("allows a valid public webhook URL", async () => {
    prisma.rule.create.mockResolvedValue({
      id: RULE_ID,
      actions: [],
      group: null,
    } as any);

    await createRuleWithResolvedActions({
      emailAccountId: EMAIL_ACCOUNT_ID,
      data: { name: "Webhook rule" },
      actions: [resolvedWebhookAction("https://example.com/webhook")],
    });

    expect(prisma.rule.create).toHaveBeenCalled();
  });

  it("skips validation for non-webhook actions", async () => {
    prisma.rule.create.mockResolvedValue({
      id: RULE_ID,
      actions: [],
      group: null,
    } as any);

    await createRuleWithResolvedActions({
      emailAccountId: EMAIL_ACCOUNT_ID,
      data: { name: "Archive rule" },
      actions: [resolvedArchiveAction()],
    });

    expect(prisma.rule.create).toHaveBeenCalled();
  });
});

describe("draft messaging actions", () => {
  beforeEach(resetRuleMocks);

  it("rejects creating a draft messaging rule with a channel from another account", async () => {
    prisma.rule.create.mockResolvedValue({
      id: RULE_ID,
      actions: [],
      group: null,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([] as any);

    await expect(
      createRule({
        result: createRuleResult({
          name: "To Reply",
          from: null,
          actions: [draftMessagingChannelAction()],
        }),
        emailAccountId: EMAIL_ACCOUNT_ID,
        provider: "gmail",
        runOnThreads: true,
        logger,
      }),
    ).rejects.toThrow("Messaging channel not found");

    expect(prisma.rule.create).not.toHaveBeenCalled();
  });

  it("rejects updating a draft messaging rule with a channel from another account", async () => {
    prisma.rule.update.mockResolvedValue({
      id: RULE_ID,
      actions: [],
      group: null,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([] as any);

    await expect(
      updateRule({
        ruleId: RULE_ID,
        result: createRuleResult({
          name: "To Reply",
          from: null,
          actions: [draftMessagingChannelAction()],
        }),
        emailAccountId: EMAIL_ACCOUNT_ID,
        provider: "gmail",
        logger,
      }),
    ).rejects.toThrow("Messaging channel not found");

    expect(prisma.rule.update).not.toHaveBeenCalled();
  });

  it("preserves messagingChannelId when updating a draft messaging rule", async () => {
    prisma.rule.update.mockResolvedValue({
      id: RULE_ID,
      actions: [],
      group: null,
    } as any);
    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: MESSAGING_CHANNEL_ID,
      },
    ] as any);

    await updateRule({
      ruleId: RULE_ID,
      result: createRuleResult({
        name: "To Reply",
        from: null,
        actions: [draftMessagingChannelAction()],
      }),
      emailAccountId: EMAIL_ACCOUNT_ID,
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
                  messagingChannelId: MESSAGING_CHANNEL_ID,
                }),
              ],
            },
          },
        }),
      }),
    );
  });
});

function resetRuleMocks() {
  vi.clearAllMocks();
  mockEnv.webhookActionsEnabled = true;
  vi.mocked(getActionRiskLevel).mockReturnValue({
    level: "low",
    message: "safe",
  });
  prisma.rule.findMany.mockResolvedValue([]);
}

function createRuleResult({
  name = "Archive rule",
  aiInstructions = null,
  staticCondition,
  from = "sender@example.com",
  actions = [archiveAction()],
}: {
  name?: string;
  aiInstructions?: string | null;
  staticCondition?: RuleResult["condition"]["static"];
  from?: string | null;
  actions?: RuleAction[];
} = {}): RuleResult {
  return {
    name,
    condition: {
      aiInstructions,
      conditionalOperator: null,
      static:
        staticCondition === undefined
          ? { from, to: null, subject: null }
          : staticCondition,
    },
    actions,
  };
}

function archiveAction(): RuleAction {
  return {
    type: ActionType.ARCHIVE,
    fields: null,
    delayInMinutes: null,
  } as RuleAction;
}

function forwardAction(): RuleAction {
  return {
    type: ActionType.FORWARD,
    fields: {
      to: "forward@example.com",
    } as any,
    delayInMinutes: null,
  } as RuleAction;
}

function labelAction(): RuleAction {
  return {
    type: ActionType.LABEL,
    fields: {
      label: "Important",
    } as any,
    delayInMinutes: null,
  } as RuleAction;
}

function webhookRuleAction(webhookUrl: string): RuleAction {
  return {
    type: ActionType.CALL_WEBHOOK,
    fields: { webhookUrl } as any,
    delayInMinutes: null,
  } as RuleAction;
}

function notifyMessagingChannelAction(): RuleAction {
  return {
    type: ActionType.NOTIFY_MESSAGING_CHANNEL,
    messagingChannelId: MESSAGING_CHANNEL_ID,
    fields: null,
    delayInMinutes: null,
  } as RuleAction;
}

function draftMessagingChannelAction(): RuleAction {
  return {
    type: ActionType.DRAFT_MESSAGING_CHANNEL,
    messagingChannelId: MESSAGING_CHANNEL_ID,
    fields: {
      content: "",
    } as any,
    delayInMinutes: null,
  } as RuleAction;
}

function resolvedArchiveAction(): ResolvedRuleAction {
  return { type: ActionType.ARCHIVE } as ResolvedRuleAction;
}

function resolvedWebhookAction(url: string): ResolvedRuleAction {
  return { type: ActionType.CALL_WEBHOOK, url } as ResolvedRuleAction;
}

function resolvedNotifyMessagingChannelAction(): ResolvedRuleAction {
  return {
    type: ActionType.NOTIFY_MESSAGING_CHANNEL,
    messagingChannelId: MESSAGING_CHANNEL_ID,
  } as ResolvedRuleAction;
}
