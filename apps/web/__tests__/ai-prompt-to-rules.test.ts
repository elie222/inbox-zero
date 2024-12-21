import { describe, it, expect, vi } from "vitest";
import { aiPromptToRules } from "@/utils/ai/rule/prompt-to-rules";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import { ActionType, RuleType } from "@prisma/client";

// pnpm test-ai ai-prompt-to-rules

const isAiTest = process.env.RUN_AI_TESTS === "true";

vi.mock("server-only", () => ({}));

describe.skipIf(!isAiTest)("aiPromptToRules", () => {
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

    const result = await aiPromptToRules({
      user,
      promptFile,
      isEditing: false,
    });

    console.log(JSON.stringify(result, null, 2));

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(prompts.length);

    // receipts
    expect(result[0]).toEqual({
      name: expect.any(String),
      condition: {
        type: RuleType.GROUP,
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
    expect(result[1]).toEqual({
      name: expect.any(String),
      condition: {
        type: RuleType.GROUP,
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
    expect(result[2]).toEqual({
      name: expect.any(String),
      condition: {
        type: RuleType.AI,
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
    expect(result[3]).toEqual({
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
        },
      ],
    });

    // Validate each rule against the schema
    for (const rule of result) {
      expect(() => createRuleSchema.parse(rule)).not.toThrow();
    }
  }, 15_000);

  it("should handle errors gracefully", async () => {
    const user = {
      email: "test@example.com",
      aiProvider: null,
      aiModel: null,
      aiApiKey: "invalid-api-key",
    };
    const promptFile = "Some prompt";

    await expect(
      aiPromptToRules({ user, promptFile, isEditing: false }),
    ).rejects.toThrow();
  });
});
