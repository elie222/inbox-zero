import { describe, expect, test, vi } from "vitest";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/ai-choose-args";
import { type Action, ActionType, RuleType } from "@prisma/client";

vi.mock("server-only", () => ({}));

describe("getActionItemsWithAiArgs", { only: true }, () => {
  test("should return actions unchanged when no AI args needed", async () => {
    const actions = [getAction({})];
    const rule = getRule("Test rule", actions);

    const result = await getActionItemsWithAiArgs({
      email: getEmail(),
      user: getUser(),
      selectedRule: rule,
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
      email: getEmail({
        subject: "Quick question",
        content: "When is the meeting tomorrow?",
      }),
      user: getUser(),
      selectedRule: rule,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(actions[0]);
  });

  test("should generate AI content for actions that need it", async () => {
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
      email: getEmail({
        subject: "Quick question",
        content: "How much are pears?",
      }),
      user: getUser(),
      selectedRule: rule,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ...actions[0],
      content: "The price of pears is: $1.99",
    });
    console.debug("Generated content:\n", result[0].content);
  });

  test("should handle multiple actions with mixed AI needs", async () => {
    const actions = [
      getAction({
        content: "Write a professional response",
      }),
      getAction({}),
    ];
    const rule = getRule("Test rule", actions);

    const result = await getActionItemsWithAiArgs({
      email: getEmail({
        subject: "Project status",
        content: "Can you update me on the project status?",
      }),
      user: getUser(),
      selectedRule: rule,
    });

    expect(result).toHaveLength(2);
    expect(result[0].content).toBeTruthy();
    expect(result[1]).toEqual(actions[1]);
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
    labelPrompt: null,
    subjectPrompt: null,
    contentPrompt: null,
    toPrompt: null,
    ccPrompt: null,
    bccPrompt: null,
    ...action,
  };
}

function getRule(instructions: string, actions: Action[] = []) {
  return {
    instructions,
    name: "Test Rule",
    actions,
    id: "r123",
    userId: "userId",
    createdAt: new Date(),
    updatedAt: new Date(),
    automate: false,
    runOnThreads: false,
    groupId: null,
    from: null,
    subject: null,
    body: null,
    to: null,
    type: RuleType.AI,
    enabled: true,
    categoryFilterType: null,
  };
}

function getEmail({
  from = "from@test.com",
  subject = "subject",
  content = "content",
}: { from?: string; subject?: string; content?: string } = {}) {
  return {
    from,
    subject,
    content,
  };
}

function getUser() {
  return {
    aiModel: null,
    aiProvider: null,
    email: "user@test.com",
    aiApiKey: null,
    about: null,
  };
}
