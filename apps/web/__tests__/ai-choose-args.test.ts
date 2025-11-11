import { describe, expect, test, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/choose-args";
import { getEmailAccount, getAction, getRule } from "@/__tests__/helpers";
import { ActionType } from "@prisma/client";

// pnpm test-ai ai-choose-args

const isAiTest = process.env.RUN_AI_TESTS === "true";

const TIMEOUT = 15_000;

vi.mock("server-only", () => ({}));

describe.runIf(isAiTest)("getActionItemsWithAiArgs", () => {
  test("should return actions unchanged when no AI args needed", async () => {
    const actions = [getAction({})];
    const rule = getRule("Test rule", actions);

    const result = await getActionItemsWithAiArgs({
      message: getParsedMessage({
        subject: "Test subject",
        content: "Test content",
      }),
      emailAccount: getEmailAccount(),
      selectedRule: rule,
      client: {} as any,
      modelType: "default",
    });

    expect(result).toEqual(actions);
  });

  test("should return actions unchanged when no variables to fill", async () => {
    const actions = [
      getAction({
        type: ActionType.REPLY,
        content: "You can set a meeting with me here: https://cal.com/alice",
      }),
    ];
    const rule = getRule("Choose this rule for meeting requests", actions);

    const result = await getActionItemsWithAiArgs({
      message: getParsedMessage({
        subject: "Quick question",
        content: "When is the meeting tomorrow?",
      }),
      emailAccount: getEmailAccount(),
      selectedRule: rule,
      client: {} as any,
      modelType: "default",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(actions[0]);
  });

  test(
    "should generate AI content for actions that need it",
    async () => {
      const actions = [
        getAction({
          type: ActionType.REPLY,
          content:
            "The price of pears is: {{the price with the dollar sign - pears are $1.99, apples are $2.99}}",
        }),
      ];
      const rule = getRule(
        "Choose this when the price of an items is asked for",
        actions,
      );

      const result = await getActionItemsWithAiArgs({
        message: getParsedMessage({
          subject: "Quick question",
          content: "How much are pears?",
        }),
        emailAccount: getEmailAccount(),
        selectedRule: rule,
        client: {} as any,
        modelType: "default",
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        ...actions[0],
        content: "The price of pears is: $1.99",
      });
      console.debug("Generated content:\n", result[0].content);
    },
    TIMEOUT,
  );

  test("should handle multiple actions with mixed AI needs", async () => {
    const actions = [
      getAction({
        content: "Write a professional response",
      }),
      getAction({}),
    ];
    const rule = getRule("Test rule", actions);

    const result = await getActionItemsWithAiArgs({
      message: getParsedMessage({
        subject: "Project status",
        content: "Can you update me on the project status?",
      }),
      emailAccount: getEmailAccount(),
      selectedRule: rule,
      client: {} as any,
      modelType: "default",
    });

    expect(result).toHaveLength(2);
    expect(result[0].content).toBeTruthy();
    expect(result[1]).toEqual(actions[1]);
  });

  test("should handle multiple variables with specific formatting", async () => {
    const actions = [
      getAction({
        type: ActionType.LABEL,
        label: "{{fruit}}",
      }),
      getAction({
        type: ActionType.REPLY,
        content: `Hey {{name}},

{{$10 for apples, $20 for pears}}

Best,
Matt`,
      }),
    ];
    const rule = getRule(
      "Use this when someone asks about the price of fruits",
      actions,
    );

    const result = await getActionItemsWithAiArgs({
      message: getParsedMessage({
        from: "jill@example.com",
        subject: "fruits",
        content: "how much do apples cost?",
      }),
      emailAccount: getEmailAccount(),
      selectedRule: rule,
      client: {} as any,
      modelType: "default",
    });

    expect(result).toHaveLength(2);

    // Check label action
    expect(result[0].label).toBeTruthy();
    expect(result[0].label).not.toContain("{{");
    expect(result[0].label).toMatch(/apple(s)?/i);

    // Check reply action
    expect(result[1].content).toMatch(/^Hey [Jj]ill,/); // Match "Hey Jill," or "Hey jill,"
    expect(result[1].content).toContain("$10");
    expect(result[1].content).toContain("Best,\nMatt");
    expect(result[1].content).not.toContain("{{");
    expect(result[1].content).not.toContain("}}");

    console.debug("Generated label:\n", result[0].label);
    console.debug("Generated content:\n", result[1].content);
  });

  test(
    "should handle label with template variable and dynamic action ID",
    async () => {
      const actions = [
        getAction({
          id: "LABEL-clkm123abc456def789", // Realistic action ID
          type: ActionType.LABEL,
          label: "Categories/{{category name}}", // Template like Finance/{{...}}
        }),
      ];
      const rule = getRule("Categorize emails by topic", actions);

      const result = await getActionItemsWithAiArgs({
        message: getParsedMessage({
          from: "notifications@amazon.com",
          subject: "Your order has shipped",
          content: "Your Amazon order #123 has been shipped",
        }),
        emailAccount: getEmailAccount(),
        selectedRule: rule,
        client: {} as any,
        modelType: "default",
      });

      expect(result).toHaveLength(1);
      expect(result[0].label).toBeTruthy();
      expect(result[0].label).toContain("Categories/");
      expect(result[0].label).not.toContain("{{");
      expect(result[0].label).not.toContain("$PARAMETER_NAME");

      console.debug("Generated label:", result[0].label);
    },
    TIMEOUT,
  );
});

// helpers
function getParsedMessage({
  from = "from@test.com",
  subject = "subject",
  content = "content",
}): ParsedMessage {
  return {
    id: "id",
    threadId: "thread-id",
    snippet: "",
    attachments: [],
    historyId: "history-id",
    internalDate: new Date().toISOString(),
    inline: [],
    textPlain: content,
    date: new Date().toISOString(),
    subject,
    // ...message,
    headers: {
      from,
      to: "recipient@example.com",
      subject,
      date: new Date().toISOString(),
      references: "",
      "message-id": "message-id",
      // ...message.headers,
    },
  };
}
