import { describe, expect, it } from "vitest";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { toCreateRuleBodyFromAiRule } from "@/utils/rule/mobile-rule";

describe("toCreateRuleBodyFromAiRule", () => {
  it("preserves semantic, static, and action fields for the rule action", () => {
    expect(
      toCreateRuleBodyFromAiRule({
        name: "Invoices",
        condition: {
          aiInstructions: "Invoices that need accounting",
          conditionalOperator: LogicalOperator.AND,
          static: {
            from: "@vendor.com",
            to: null,
            subject: "Invoice",
          },
        },
        actions: [
          {
            type: ActionType.LABEL,
            fields: { label: "Accounting" },
            delayInMinutes: null,
          },
          {
            type: ActionType.FORWARD,
            fields: {
              to: "jane@accounting.com",
              subject: "New invoice",
              content: "Please review",
            },
            delayInMinutes: 10,
          },
        ],
      }),
    ).toEqual({
      name: "Invoices",
      runOnThreads: true,
      conditionalOperator: LogicalOperator.AND,
      conditions: [
        {
          type: "AI",
          instructions: "Invoices that need accounting",
        },
        {
          type: "STATIC",
          from: "@vendor.com",
        },
        {
          type: "STATIC",
          subject: "Invoice",
        },
      ],
      actions: [
        {
          type: ActionType.LABEL,
          labelId: { name: "Accounting" },
          subject: undefined,
          content: undefined,
          to: undefined,
          cc: undefined,
          bcc: undefined,
          url: undefined,
          folderName: undefined,
          delayInMinutes: null,
        },
        {
          type: ActionType.FORWARD,
          labelId: undefined,
          subject: { value: "New invoice" },
          content: { value: "Please review" },
          to: { value: "jane@accounting.com" },
          cc: undefined,
          bcc: undefined,
          url: undefined,
          folderName: undefined,
          delayInMinutes: 10,
        },
      ],
    });
  });
});
