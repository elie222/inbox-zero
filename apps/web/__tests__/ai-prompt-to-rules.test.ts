import { describe, it, expect, vi } from "vitest";
import { aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";

vi.mock("server-only", () => ({}));

describe.only("aiPromptToRules", () => {
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
      requiresAI: "no",
      actions: [
        {
          type: "LABEL",
          label: "Receipt",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
      ],
      group: "Receipts",
    });

    // newsletters
    expect(result.rules[1]).toEqual({
      name: expect.any(String),
      requiresAI: "no",
      actions: [
        {
          type: "ARCHIVE",
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
        {
          type: "LABEL",
          label: "Newsletter",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
      ],
      group: "Newsletters",
    });

    // marketing
    expect(result.rules[2]).toEqual({
      name: expect.any(String),
      requiresAI: "yes",
      actions: [
        {
          type: "ARCHIVE",
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
        {
          type: "LABEL",
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
      requiresAI: "no",
      actions: [
        {
          type: "LABEL",
          label: "Internal",
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
        },
      ],
      staticConditions: {
        from: "mycompany.com",
      },
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
