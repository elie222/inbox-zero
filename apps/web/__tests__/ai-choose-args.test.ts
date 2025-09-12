import { describe, expect, test, vi } from "vitest";
import { type Action, ActionType, LogicalOperator } from "@/generated/prisma";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/choose-args";
import { getEmailAccount } from "@/__tests__/helpers";

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
});

// helpers
function getAction(action: Partial<Action> = {}): Action {
  return {
    id: "a123",
    createdAt: new Date(),
    updatedAt: new Date(),
    type: ActionType.REPLY,
    ruleId: "ruleId",
    label: null,
    subject: null,
    content: null,
    to: null,
    cc: null,
    bcc: null,
    url: null,
    delayInMinutes: null,
    folderName: null,
    folderId: null,
    ...action,
  };
}

function getRule(
  instructions: string,
  actions: Action[] = [],
): RuleWithActions {
  return {
    instructions,
    name: "Test Rule",
    actions,
    id: "r123",
    emailAccountId: "emailAccountId",
    createdAt: new Date(),
    updatedAt: new Date(),
    automate: false,
    runOnThreads: false,
    groupId: null,
    from: null,
    subject: null,
    body: null,
    to: null,
    enabled: true,
    categoryFilterType: null,
    conditionalOperator: LogicalOperator.AND,
    systemType: null,
    promptText: null,
  };
}

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
