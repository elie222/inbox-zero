import { describe, it, expect, vi } from "vitest";
import { aiPromptToRulesOld as aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules-old";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import { ActionType } from "@prisma/client";
import { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai ai-prompt-to-rules

const isAiTest = process.env.RUN_AI_TESTS === "true";

vi.mock("server-only", () => ({}));

describe.runIf(isAiTest)("aiPromptToRules", () => {
  it("should convert prompt file to rules", async () => {
    const emailAccount = getEmailAccount();

    const prompts = [
      `* Label receipts as "Receipt"`,
      `* Archive all newsletters and label them "Newsletter"`,
      `* Archive all marketing emails and label them "Marketing"`,
      `* Label all emails from mycompany.com as "Internal"`,
    ];

    const promptFile = prompts.join("\n");

    const result = await aiPromptToRules({
      emailAccount,
      promptFile,
      isEditing: false,
    });

    console.log(JSON.stringify(result, null, 2));

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(prompts.length);

    // receipts
    expect(result[0]).toMatchObject({
      name: expect.any(String),
      condition: {
        group: "Receipts",
      },
      actions: [
        {
          type: ActionType.LABEL,
          label: "Receipt",
        },
      ],
    });

    // newsletters
    expect(result[1]).toMatchObject({
      name: expect.any(String),
      condition: {
        group: "Newsletters",
      },
      actions: [
        {
          type: ActionType.ARCHIVE,
        },
        {
          type: ActionType.LABEL,
          label: "Newsletter",
        },
      ],
    });

    // marketing
    expect(result[2]).toMatchObject({
      name: expect.any(String),
      condition: {
        aiInstructions: expect.any(String),
      },
      actions: [
        {
          type: ActionType.ARCHIVE,
        },
        {
          type: ActionType.LABEL,
          label: "Marketing",
        },
      ],
    });

    // internal
    expect(result[3]).toMatchObject({
      name: expect.any(String),
      condition: {
        static: {
          from: "mycompany.com",
        },
      },
      actions: [
        {
          type: ActionType.LABEL,
          label: "Internal",
        },
      ],
    });

    // Validate each rule against the schema
    for (const rule of result) {
      expect(() =>
        createRuleSchema(emailAccount.account.provider).parse(rule),
      ).not.toThrow();
    }
  }, 15_000);

  it("should handle errors gracefully", async () => {
    const emailAccount = {
      ...getEmailAccount(),
      user: { ...getEmailAccount().user, aiApiKey: "invalid-api-key" },
    };

    const promptFile = "Some prompt";

    await expect(
      aiPromptToRules({
        emailAccount,
        promptFile,
        isEditing: false,
      }),
    ).rejects.toThrow();
  });

  it("should handle complex email forwarding rules", async () => {
    const emailAccount = getEmailAccount();

    const promptFile = `
      * Forward urgent emails about system outages to urgent@company.com and label as "Urgent"
      * When someone asks for pricing, forward to sales@company.com and label as "Sales Lead"
      * Forward emails from VIP clients (from @bigclient.com) to vip-support@company.com
    `.trim();

    const result = await aiPromptToRules({
      emailAccount,
      promptFile,
      isEditing: false,
    });

    expect(result.length).toBe(3);

    // System outages rule
    expect(result[0]).toMatchObject({
      name: expect.any(String),
      condition: {
        aiInstructions: expect.stringMatching(/system|outage|urgent/i),
      },
      actions: [
        {
          type: ActionType.FORWARD,
          to: "urgent@company.com",
        },
        {
          type: ActionType.LABEL,
          label: "Urgent",
        },
      ],
    });

    // Sales lead rule
    expect(result[1]).toMatchObject({
      name: expect.any(String),
      condition: {
        aiInstructions: expect.stringMatching(/pricing|sales/i),
      },
      actions: [
        {
          type: ActionType.FORWARD,
          to: "sales@company.com",
        },
        {
          type: ActionType.LABEL,
          label: "Sales Lead",
        },
      ],
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
          to: "vip-support@company.com",
        },
      ],
    });
  }, 15_000);

  it("should handle reply templates with smart categories", async () => {
    const emailAccount = getEmailAccount();

    const promptFile = `
      When someone sends a job application, reply with:
      """
      Thank you for your application. We'll review it and get back to you within 5 business days.
      Best regards,
      HR Team
      """
    `.trim();

    const result = await aiPromptToRules({
      emailAccount,
      promptFile,
      isEditing: false,
      availableCategories: ["Job Applications", "HR", "Recruiting"],
    });

    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({
      name: expect.any(String),
      condition: {
        categories: {
          categoryFilterType: "INCLUDE",
          categoryFilters: ["Job Applications"],
        },
      },
      actions: [
        {
          type: ActionType.REPLY,
          content: expect.stringMatching(/Thank you for your application/),
        },
      ],
    });
  }, 15_000);

  it("should handle multiple conditions in a single rule", async () => {
    const emailAccount = getEmailAccount();

    const promptFile = `
      When I get an urgent email from support@company.com containing the word "escalation", 
      forward it to manager@company.com and label it as "Escalation"
    `.trim();

    const result = await aiPromptToRules({
      emailAccount,
      promptFile,
      isEditing: false,
    });

    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({
      name: expect.any(String),
      condition: {
        conditionalOperator: "AND",
        static: {
          from: "support@company.com",
        },
        aiInstructions: expect.stringMatching(/urgent|escalation/i),
      },
      actions: [
        {
          type: ActionType.FORWARD,
          to: "manager@company.com",
        },
        {
          type: ActionType.LABEL,
          label: "Escalation",
        },
      ],
    });
  }, 15_000);

  it("should handle template variables in replies", async () => {
    const emailAccount = getEmailAccount();

    const promptFile = `
      When someone asks about pricing, reply with:
      """
      Hi [firstName],

      Thank you for your interest in our pricing. Our plans start at $10/month.
      
      Best regards,
      Sales Team
      """
    `.trim();

    const result = await aiPromptToRules({
      emailAccount,
      promptFile,
      isEditing: false,
    });

    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({
      name: expect.any(String),
      condition: {
        aiInstructions: expect.stringMatching(/pricing|price/i),
      },
      actions: [
        {
          type: ActionType.REPLY,
          content: expect.stringMatching(/Hi {{firstName}}/),
        },
      ],
    });

    // Verify template variable is preserved in the content
    const replyAction = result[0].actions.find(
      (a) => a.type === ActionType.REPLY,
    );
    expect(replyAction?.fields?.content).toContain("{{firstName}}");
  }, 15_000);
});
