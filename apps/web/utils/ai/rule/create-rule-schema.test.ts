import { describe, expect, it } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import { createRuleSchema, getAvailableActions } from "./create-rule-schema";

describe("createRuleSchema", () => {
  const provider = "google";
  const hasSendEmail = getAvailableActions(provider).includes(
    ActionType.SEND_EMAIL,
  );

  it("rejects SEND_EMAIL without fields.to", () => {
    if (!hasSendEmail) return;

    const result = createRuleSchema(provider).safeParse(
      buildRule({
        type: ActionType.SEND_EMAIL,
        fields: {
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: "Hello",
          content: "World",
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("SEND_EMAIL requires");
    }
  });

  it("accepts SEND_EMAIL when fields.to is present", () => {
    if (!hasSendEmail) return;

    const result = createRuleSchema(provider).safeParse(
      buildRule({
        type: ActionType.SEND_EMAIL,
        fields: {
          label: null,
          to: "recipient@example.com",
          cc: null,
          bcc: null,
          subject: "Hello",
          content: "World",
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(true);
  });

  it("accepts REPLY without fields.to", () => {
    if (!hasSendEmail) return;

    const result = createRuleSchema(provider).safeParse(
      buildRule({
        type: ActionType.REPLY,
        fields: {
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: "Thanks for your email",
          webhookUrl: null,
        },
        delayInMinutes: null,
      }),
    );

    expect(result.success).toBe(true);
  });

  function buildRule(action: {
    type: ActionType;
    fields: {
      label: string | null;
      to: string | null;
      cc: string | null;
      bcc: string | null;
      subject: string | null;
      content: string | null;
      webhookUrl: string | null;
    };
    delayInMinutes: number | null;
  }) {
    return {
      name: "AutoReplyRule",
      condition: {
        conditionalOperator: null,
        aiInstructions: "Auto reply to support emails",
        static: null,
      },
      actions: [action],
    };
  }
});
