import { describe, it, expect } from "vitest";
import { aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules";
import {
  type CreateRuleSchema,
  createRuleSchema,
} from "@/utils/ai/rule/create-rule-schema";
import { ActionType } from "@/generated/prisma/enums";
import { getEmailAccount } from "@/__tests__/helpers";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";

// Run with: pnpm test-ai ai-regression/ai-prompt-to-rules

const isAiTest = process.env.RUN_AI_TESTS === "true";

const TIMEOUT = 15_000;

describe.runIf(isAiTest)("aiPromptToRules", () => {
  it(
    "should convert prompt file to rules",
    async () => {
      const emailAccount = getEmailAccount();

      const prompts = [
        `* Label receipts as "Receipt"`,
        `* Archive all newsletters and label them "Newsletter"`,
        `* Archive all marketing emails and label them "Marketing"`,
        `* Label all emails from mycompany.com as "Internal"`,
      ];

      const promptFile = prompts.join("\n");

      const result = await aiPromptToRules({ emailAccount, promptFile });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(prompts.length);

      // receipts
      expect(result[0]).toMatchObject({
        name: expect.any(String),
        actions: [
          {
            type: ActionType.LABEL,
            fields: {
              label: "Receipt",
            },
          },
        ],
      });
      await expectConditionSemantics({
        prompt: prompts[0],
        rule: result[0],
        expected:
          "The condition should match receipt-like emails, such as receipts, invoices, purchase confirmations, or billing statements.",
      });

      // newsletters
      expect(result[1]).toMatchObject({
        name: expect.any(String),
        actions: [
          {
            type: ActionType.ARCHIVE,
          },
          {
            type: ActionType.LABEL,
            fields: {
              label: "Newsletter",
            },
          },
        ],
      });
      await expectConditionSemantics({
        prompt: prompts[1],
        rule: result[1],
        expected: "The condition should match newsletter emails.",
      });

      // marketing
      expect(result[2]).toMatchObject({
        name: expect.any(String),
        actions: [
          {
            type: ActionType.ARCHIVE,
          },
          {
            type: ActionType.LABEL,
            fields: {
              label: "Marketing",
            },
          },
        ],
      });
      await expectConditionSemantics({
        prompt: prompts[2],
        rule: result[2],
        expected: "The condition should match marketing emails.",
      });

      // internal
      expect(result[3]).toMatchObject({
        name: expect.any(String),
        actions: [
          {
            type: ActionType.LABEL,
            fields: {
              label: "Internal",
            },
          },
        ],
      });
      expect(["mycompany.com", "@mycompany.com"]).toContain(
        result[3].condition.static?.from,
      );

      // Validate each rule against the schema
      for (const rule of result) {
        expect(() =>
          createRuleSchema(emailAccount.account.provider).parse(rule),
        ).not.toThrow();
      }
    },
    TIMEOUT,
  );

  it("should handle errors gracefully", async () => {
    const emailAccount = {
      ...getEmailAccount(),
      user: { ...getEmailAccount().user, aiApiKey: "invalid-api-key" },
    };

    const promptFile = "Some prompt";

    await expect(
      aiPromptToRules({ emailAccount, promptFile }),
    ).rejects.toThrow();
  });

  it(
    "should handle complex email forwarding rules",
    async () => {
      const emailAccount = getEmailAccount();

      const prompts = [
        'Forward urgent emails about system outages to urgent@company.com and label as "Urgent"',
        'When someone asks for pricing, forward to sales@company.com and label as "Sales Lead"',
        "Forward emails from VIP clients (from @bigclient.com) to vip-support@company.com",
      ];
      const promptFile = prompts.map((prompt) => `* ${prompt}`).join("\n");

      const result = await aiPromptToRules({ emailAccount, promptFile });

      expect(result.length).toBe(3);

      // System outages rule
      expect(result[0]).toMatchObject({
        name: expect.any(String),
        actions: [
          {
            type: ActionType.FORWARD,
            fields: {
              to: "urgent@company.com",
            },
          },
          {
            type: ActionType.LABEL,
            fields: {
              label: "Urgent",
            },
          },
        ],
      });
      await expectConditionSemantics({
        prompt: prompts[0],
        rule: result[0],
        expected:
          "The condition should match urgent emails about system outages.",
      });

      // Sales lead rule
      expect(result[1]).toMatchObject({
        name: expect.any(String),
        actions: [
          {
            type: ActionType.FORWARD,
            fields: {
              to: "sales@company.com",
            },
          },
          {
            type: ActionType.LABEL,
            fields: {
              label: "Sales Lead",
            },
          },
        ],
      });
      await expectConditionSemantics({
        prompt: prompts[1],
        rule: result[1],
        expected:
          "The condition should match emails where someone asks about pricing.",
      });

      // VIP client rule
      expect(result[2]).toMatchObject({
        name: expect.any(String),
        condition: {
          static: {
            from: "@bigclient.com",
          },
        },
        actions: [
          {
            type: ActionType.FORWARD,
            fields: {
              to: "vip-support@company.com",
            },
          },
        ],
      });
    },
    TIMEOUT,
  );

  it(
    "should handle reply templates with smart categories",
    async () => {
      const emailAccount = getEmailAccount();

      const promptFile = `
      When someone sends a job application, reply with:
      """
      Thank you for your application. We'll review it and get back to you within 5 business days.
      Best regards,
      HR Team
      """
    `.trim();

      const result = await aiPromptToRules({ emailAccount, promptFile });

      expect(result.length).toBe(1);
      expect(result[0]).toMatchObject({
        name: expect.any(String),
        actions: [
          {
            type: ActionType.REPLY,
            fields: {
              content: expect.stringContaining(
                "Thank you for your application",
              ),
            },
          },
        ],
      });
      await expectConditionSemantics({
        prompt: promptFile,
        rule: result[0],
        expected:
          "The condition should match emails that are job applications or candidate submissions.",
      });
    },
    TIMEOUT,
  );

  it(
    "should handle multiple conditions in a single rule",
    async () => {
      const emailAccount = getEmailAccount();

      const promptFile = `
      When I get an urgent email from support@company.com containing the word "escalation", 
      forward it to manager@company.com and label it as "Escalation"
    `.trim();

      const result = await aiPromptToRules({ emailAccount, promptFile });

      expect(result.length).toBe(1);
      expect(result[0]).toMatchObject({
        name: expect.any(String),
        condition: {
          conditionalOperator: "AND",
          static: {
            from: "support@company.com",
          },
        },
        actions: [
          {
            type: ActionType.FORWARD,
            fields: {
              to: "manager@company.com",
            },
          },
          {
            type: ActionType.LABEL,
            fields: {
              label: "Escalation",
            },
          },
        ],
      });
      await expectConditionSemantics({
        prompt: promptFile,
        rule: result[0],
        expected:
          "The condition should require both the sender support@company.com and the semantic/content requirement that the email is urgent or contains an escalation request.",
      });
    },
    TIMEOUT,
  );

  it(
    "should handle template variables in replies",
    async () => {
      const emailAccount = getEmailAccount();

      const promptFile = `
      When someone asks about pricing, reply with:
      """
      Hi {{firstName}},

      Thank you for your interest in our pricing. Our plans start at $10/month.
      
      Best regards,
      Sales Team
      """
    `.trim();

      const result = await aiPromptToRules({ emailAccount, promptFile });

      expect(result.length).toBe(1);
      expect(result[0]).toMatchObject({
        name: expect.any(String),
        actions: [
          {
            type: ActionType.REPLY,
            fields: {
              content: expect.stringContaining("Hi {{firstName}}"),
            },
          },
        ],
      });
      await expectConditionSemantics({
        prompt: promptFile,
        rule: result[0],
        expected:
          "The condition should match emails where someone asks about pricing.",
      });

      // Verify template variable is preserved in the content
      const replyAction = result[0].actions.find(
        (a) => a.type === ActionType.REPLY,
      );
      expect(replyAction?.fields?.content).toContain("{{firstName}}");
    },
    TIMEOUT,
  );
});

async function expectConditionSemantics({
  expected,
  prompt,
  rule,
}: {
  expected: string;
  prompt: string;
  rule: CreateRuleSchema;
}) {
  const output = JSON.stringify(rule.condition);
  const judgeResult = await judgeEvalOutput({
    input: prompt,
    output,
    expected,
    criterion: {
      name: "Rule condition semantics",
      description:
        "The generated rule condition should semantically capture the requested matching behavior. Exact wording is irrelevant. static.from is for sender filters, and aiInstructions is the correct place for semantic or content constraints because this schema has no separate body/keyword filter field. Missing semantic constraints should fail.",
    },
  });

  expect(judgeResult.pass, formatSemanticJudgeActual(output, judgeResult)).toBe(
    true,
  );
}
