import { describe, expect, it } from "vitest";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { createRuleBody } from "@/utils/actions/rule.validation";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
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

  it("produces a move folder rule that passes rule validation without a folder id", () => {
    const result = createRuleBody.safeParse(
      toCreateRuleBodyFromAiRule({
        name: "Receipts",
        condition: {
          aiInstructions: "Receipts from online purchases",
          conditionalOperator: LogicalOperator.AND,
          static: null,
        },
        actions: [
          {
            type: ActionType.MOVE_FOLDER,
            fields: { folderName: "Receipts" },
            delayInMinutes: null,
          },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it("treats an AI-generated zero-minute delay as no delay", () => {
    const generatedRule = createRuleSchema("google").parse({
      name: "Invoices",
      condition: {
        aiInstructions: null,
        conditionalOperator: null,
        static: { subject: "Invoice" },
      },
      actions: [
        {
          type: ActionType.ARCHIVE,
          fields: null,
          delayInMinutes: 0,
        },
      ],
    });

    const rule = toCreateRuleBodyFromAiRule(generatedRule);

    expect(rule.actions[0].delayInMinutes).toBeUndefined();
    expect(createRuleBody.safeParse(rule).success).toBe(true);
  });
});
