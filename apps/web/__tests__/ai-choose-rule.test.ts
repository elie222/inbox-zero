import { describe, expect, test, vi } from "vitest";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { type Action, ActionType, LogicalOperator } from "@prisma/client";

// pnpm test-ai ai-choose-rule

const isAiTest = process.env.RUN_AI_TESTS === "true";

vi.mock("server-only", () => ({}));

describe.skipIf(!isAiTest)("aiChooseRule", () => {
  test("Should return no rule when no rules passed", async () => {
    const result = await aiChooseRule({
      rules: [],
      email: getEmail(),
      user: getUser(),
    });

    expect(result).toEqual({ reason: "No rules" });
  });

  test("Should return correct rule when only one rule passed", async () => {
    const rule = getRule(
      "Match emails that have the word 'test' in the subject line",
    );

    const result = await aiChooseRule({
      email: getEmail({ subject: "test" }),
      rules: [rule],
      user: getUser(),
    });

    expect(result).toEqual({
      rule,
      reason: expect.any(String),
    });
  });

  test("Should return correct rule when multiple rules passed", async () => {
    const rule1 = getRule(
      "Match emails that have the word 'test' in the subject line",
    );
    const rule2 = getRule(
      "Match emails that have the word 'remember' in the subject line",
    );

    const result = await aiChooseRule({
      rules: [rule1, rule2],
      email: getEmail({ subject: "remember that call" }),
      user: getUser(),
    });

    expect(result).toEqual({
      rule: rule2,
      reason: expect.any(String),
    });
  });

  test("Should generate action arguments", async () => {
    const rule1 = getRule(
      "Match emails that have the word 'question' in the subject line",
    );
    const rule2 = getRule("Match emails asking for a joke", [
      {
        id: "id",
        createdAt: new Date(),
        updatedAt: new Date(),
        type: ActionType.REPLY,
        ruleId: "ruleId",
        label: null,
        subject: null,
        content: "{{Write a joke}}",
        to: null,
        cc: null,
        bcc: null,
        url: null,
      },
    ]);

    const result = await aiChooseRule({
      rules: [rule1, rule2],
      email: getEmail({
        subject: "Joke",
        content: "Tell me a joke about sheep",
      }),
      user: getUser(),
    });

    expect(result).toEqual({
      rule: rule2,
      reason: expect.any(String),
    });
  });
});

// helpers
function getRule(instructions: string, actions: Action[] = []) {
  return {
    instructions,
    name: "Joke requests",
    actions,
    id: "id",
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
    enabled: true,
    categoryFilterType: null,
    conditionalOperator: LogicalOperator.AND,
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
