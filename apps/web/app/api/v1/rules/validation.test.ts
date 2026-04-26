import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import { ruleRequestBodySchema, rulesResponseSchema } from "./validation";
import { WEBHOOK_ACTION_DISABLED_MESSAGE } from "@/utils/webhook-action";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    webhookActionsEnabled: true,
  },
}));

vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED() {
      return mockEnv.webhookActionsEnabled;
    },
  },
}));

describe("rule API validation", () => {
  beforeEach(() => {
    mockEnv.webhookActionsEnabled = true;
  });

  it.each([
    {
      type: ActionType.LABEL,
      fields: {},
      expectedPath: ["actions", 0, "fields", "label"],
    },
    {
      type: ActionType.CALL_WEBHOOK,
      fields: {},
      expectedPath: ["actions", 0, "fields", "webhookUrl"],
    },
    {
      type: ActionType.MOVE_FOLDER,
      fields: {},
      expectedPath: ["actions", 0, "fields", "folderName"],
    },
  ])("requires the expected action fields for $type", ({
    type,
    fields,
    expectedPath,
  }) => {
    const result = ruleRequestBodySchema.safeParse({
      name: "Rule",
      runOnThreads: true,
      condition: {
        aiInstructions: "Match this email",
      },
      actions: [
        {
          type,
          fields,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(expectedPath);
  });

  it.each([
    ActionType.DRAFT_MESSAGING_CHANNEL,
    ActionType.NOTIFY_MESSAGING_CHANNEL,
  ])("rejects invalid messagingChannelId values in request %s actions", (type) => {
    const result = ruleRequestBodySchema.safeParse({
      name: "Rule",
      runOnThreads: true,
      condition: {
        aiInstructions: "Match this email",
      },
      actions: [
        {
          type,
          messagingChannelId: "channel-1",
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      "actions",
      0,
      "messagingChannelId",
    ]);
  });

  it("rejects unknown response action types", () => {
    const result = rulesResponseSchema.safeParse({
      rules: [
        {
          id: "rule-id",
          name: "Rule",
          enabled: true,
          runOnThreads: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          condition: {
            conditionalOperator: null,
            aiInstructions: "Match this email",
            static: {
              from: null,
              to: null,
              subject: null,
            },
          },
          actions: [
            {
              type: "UNKNOWN",
              fields: {
                label: null,
                to: null,
                cc: null,
                bcc: null,
                subject: null,
                content: null,
                webhookUrl: null,
                folderName: null,
              },
              delayInMinutes: null,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it.each([
    ActionType.DRAFT_MESSAGING_CHANNEL,
    ActionType.NOTIFY_MESSAGING_CHANNEL,
  ])("rejects invalid messagingChannelId values in response %s actions", (type) => {
    const result = rulesResponseSchema.safeParse({
      rules: [
        {
          id: "rule-id",
          name: "Rule",
          enabled: true,
          runOnThreads: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          condition: {
            conditionalOperator: null,
            aiInstructions: "Match this email",
            static: {
              from: null,
              to: null,
              subject: null,
            },
          },
          actions: [
            {
              type,
              messagingChannelId: "channel-1",
              fields: {
                label: null,
                to: null,
                cc: null,
                bcc: null,
                subject: null,
                content: null,
                webhookUrl: null,
                folderName: null,
              },
              delayInMinutes: null,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      "rules",
      0,
      "actions",
      0,
      "messagingChannelId",
    ]);
  });

  it("rejects CALL_WEBHOOK when webhook actions are disabled", () => {
    mockEnv.webhookActionsEnabled = false;

    const result = ruleRequestBodySchema.safeParse({
      name: "Rule",
      runOnThreads: true,
      condition: {
        aiInstructions: "Match this email",
      },
      actions: [
        {
          type: ActionType.CALL_WEBHOOK,
          fields: {
            webhookUrl: "https://example.com/webhook",
          },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      WEBHOOK_ACTION_DISABLED_MESSAGE,
    );
    expect(result.error?.issues[0]?.path).toEqual(["actions", 0, "type"]);
  });
});
