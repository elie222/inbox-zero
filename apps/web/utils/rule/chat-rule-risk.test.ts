import { describe, expect, it } from "vitest";

import { ActionType } from "@/generated/prisma/enums";
import { actionsNeedChatRiskConfirmation } from "@/utils/rule/rule";

describe("actionsNeedChatRiskConfirmation", () => {
  it("returns needsConfirmation false when only label actions", () => {
    const result = actionsNeedChatRiskConfirmation({
      name: "x",
      condition: {
        aiInstructions: null,
        conditionalOperator: null,
        static: { from: "@a.com", to: null, subject: null },
      },
      actions: [
        {
          type: ActionType.LABEL,
          fields: { label: "Inbox" },
          delayInMinutes: null,
        },
      ],
    });
    expect(result.needsConfirmation).toBe(false);
    expect(result.riskMessages).toHaveLength(0);
  });

  it("returns needsConfirmation true for fully dynamic reply content and recipient", () => {
    const result = actionsNeedChatRiskConfirmation({
      name: "x",
      condition: {
        aiInstructions: "when urgent",
        conditionalOperator: null,
        static: { from: null, to: null, subject: null },
      },
      actions: [
        {
          type: ActionType.REPLY,
          fields: { content: "{{var}}", to: "{{dyn}}" },
          delayInMinutes: null,
        },
      ],
    });
    expect(result.needsConfirmation).toBe(true);
    expect(result.riskMessages.length).toBeGreaterThan(0);
  });

  it("returns needsConfirmation false for static reply body and implicit recipient", () => {
    const result = actionsNeedChatRiskConfirmation({
      name: "x",
      condition: {
        aiInstructions: null,
        conditionalOperator: null,
        static: { from: "@vendor.com", to: null, subject: null },
      },
      actions: [
        {
          type: ActionType.REPLY,
          fields: {
            content: "Thanks, we received your message.",
            to: null,
          },
          delayInMinutes: null,
        },
      ],
    });
    expect(result.needsConfirmation).toBe(false);
  });

  it("returns needsConfirmation true for webhook actions", () => {
    const result = actionsNeedChatRiskConfirmation({
      name: "x",
      condition: {
        aiInstructions: null,
        conditionalOperator: null,
        static: { from: "@vendor.com", to: null, subject: null },
      },
      actions: [
        {
          type: ActionType.CALL_WEBHOOK,
          fields: {
            webhookUrl: "https://api.example.com/webhook",
          },
          delayInMinutes: null,
        },
      ],
    });

    expect(result.needsConfirmation).toBe(true);
    expect(result.riskMessages).toEqual([
      expect.stringContaining("Webhook actions can send email data"),
    ]);
  });

  it("returns needsConfirmation true when an integration action uses AI-filled args", () => {
    const result = actionsNeedChatRiskConfirmation({
      name: "x",
      condition: {
        aiInstructions: null,
        conditionalOperator: null,
        static: { from: "@vendor.com", to: null, subject: null },
      },
      actions: [
        {
          type: ActionType.INTEGRATION,
          fields: {
            content: null,
            description: null,
            dueString: null,
          },
          delayInMinutes: null,
        },
      ],
    });

    expect(result.needsConfirmation).toBe(true);
    expect(result.riskMessages).toEqual([
      expect.stringContaining("creating unwanted or misleading tasks"),
    ]);
  });

  it("returns needsConfirmation false for integration actions with static args", () => {
    const result = actionsNeedChatRiskConfirmation({
      name: "x",
      condition: {
        aiInstructions: null,
        conditionalOperator: null,
        static: { from: "@vendor.com", to: null, subject: null },
      },
      actions: [
        {
          type: ActionType.INTEGRATION,
          fields: {
            content: "Review the contract",
            description: "Sent by the contracts team",
            dueString: "today",
          },
          delayInMinutes: null,
        },
      ],
    });

    expect(result.needsConfirmation).toBe(false);
    expect(result.riskMessages).toEqual([]);
  });
});
