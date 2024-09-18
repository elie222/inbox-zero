import { describe, it, expect, vi } from "vitest";
import { aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import { ActionType, RuleType } from "@prisma/client";

vi.mock("server-only", () => ({}));

describe("aiPromptToRules", () => {
  it("should convert prompt file to rules", async () => {
    const user = {
      email: "user@test.com",
      aiModel: null,
      aiProvider: null,
      aiApiKey: null,
    };

    const prompts = [
      `* Label receipts as "Receipt"`,
      `* Archive all newsletters and label them "Newsletter"`,
      `* Archive all marketing emails and label them "Marketing"`,
      `* Label all emails from mycompany.com as "Internal"`,
    ];

    const promptFile = prompts.join("\n");

    const result = await aiPromptToRules({ user, promptFile });

    console.log(JSON.stringify(result, null, 2));

    expect(Array.isArray(result.rules)).toBe(true);
    expect(result.rules.length).toBe(prompts.length);

    // receipts
    expect(result.rules[0]).toEqual({
      name: expect.any(String),
      condition: {
        type: RuleType.GROUP,
        group: "Receipts",
      },
      actions: [
        {
          type: ActionType.LABEL,
          label: "Receipt",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
      ],
    });

    // newsletters
    expect(result.rules[1]).toEqual({
      name: expect.any(String),
      condition: {
        type: RuleType.GROUP,
        group: "Newsletters",
      },
      actions: [
        {
          type: ActionType.ARCHIVE,
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
        {
          type: ActionType.LABEL,
          label: "Newsletter",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
      ],
    });

    // marketing
    expect(result.rules[2]).toEqual({
      name: expect.any(String),
      condition: {
        type: RuleType.AI,
        aiInstructions: expect.any(String),
      },
      actions: [
        {
          type: ActionType.ARCHIVE,
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
        {
          type: ActionType.LABEL,
          label: "Marketing",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
      ],
    });

    // internal
    expect(result.rules[3]).toEqual({
      name: expect.any(String),
      condition: {
        type: RuleType.STATIC,
        static: {
          from: "mycompany.com",
        },
      },
      actions: [
        {
          type: ActionType.LABEL,
          label: "Internal",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
      ],
    });

    // Validate each rule against the schema
    result.rules.forEach((rule) => {
      expect(() => createRuleSchema.parse(rule)).not.toThrow();
    });
  }, 15_000);

  it("should handle errors gracefully", async () => {
    const user = {
      email: "test@example.com",
      aiProvider: null,
      aiModel: null,
      aiApiKey: "invalid-api-key",
    };
    const promptFile = "Some prompt";

    await expect(aiPromptToRules({ user, promptFile })).rejects.toThrow();
  });
});
