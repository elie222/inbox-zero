import { expect, test, vi } from "vitest";
import { chooseRule } from "@/utils/ai/choose-rule/choose";
import { RuleType } from "@prisma/client";

vi.mock("server-only", () => ({}));

test("Should return no rule when no rules passed", async () => {
  const result = await chooseRule({
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

  const result = await chooseRule({
    email: getEmail({ content: "test" }),
    rules: [rule],
    user: getUser(),
  });

  expect(result).toEqual({ rule, reason: expect.any(String), actionItems: [] });
});

test("Should return correct rule when multiple rules passed", async () => {
  const rule1 = getRule(
    "Match emails that have the word 'test' in the subject line",
  );
  const rule2 = getRule(
    "Match emails that have the word 'remember' in the subject line",
  );

  const result = await chooseRule({
    rules: [rule1, rule2],
    email: getEmail({ content: "remember that call" }),
    user: getUser(),
  });

  expect(result).toEqual({
    rule: rule2,
    reason: expect.any(String),
    actionItems: [],
  });
});

function getRule(instructions: string) {
  return {
    instructions,
    name: "name",
    actions: [],
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
    type: RuleType.AI,
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
    aiModel: "gpt-4o",
    aiProvider: "openai",
    email: "user@test.com",
    openAIApiKey: null,
    about: null,
  };
}
