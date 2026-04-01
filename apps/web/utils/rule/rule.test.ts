import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { ActionType } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";

vi.mock("@/utils/prisma");
vi.mock("@/utils/risk", () => ({
  getActionRiskLevel: vi.fn(),
}));
vi.mock("@/app/(app)/[emailAccountId]/assistant/examples", () => ({
  hasExampleParams: vi.fn(() => false),
}));
vi.mock("@/utils/rule/rule-history", () => ({
  createRuleHistory: vi.fn(),
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

import {
  createRule,
  deleteRule,
  partialUpdateRule,
  updateRule,
  updateRuleActions,
} from "./rule";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

describe("deleteRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});

describe("outbound action guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});

describe("draft messaging actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves messagingChannelId when updating a draft messaging rule", async () => {
    prisma.rule.update.mockResolvedValue({
      id: "rule-id",
      actions: [],
      group: null,
    } as any);

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
