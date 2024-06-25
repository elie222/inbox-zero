import { expect, test, vi } from "vitest";
import { chooseRule } from "@/utils/ai/choose-rule/choose";
import { RuleType } from "@prisma/client";

vi.mock("server-only", () => ({}));

test("Should return no rule when no rules passed", async () => {
  const result = await chooseRule({
    email: {
      from: "from@test.com",
      subject: "test",
      content: "test",
    },
    rules: [],
    user: {
      aiModel: "gpt-4o",
      aiProvider: "openai",
      email: "user@test.com",
      openAIApiKey: null,
      about: null,
    },
  });

  expect(result).toEqual({ reason: "No rules" });
});

test("Should return correct rule", async () => {
  const rule = {
    instructions: "Match emails that have the word 'test' in the subject line",
    name: "rule1",
    actions: [],
    id: "ruleId",
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

  const result = await chooseRule({
    email: {
      from: "from@test.com",
      subject: "test",
      content: "test",
    },
    rules: [rule],
    user: {
      aiModel: "gpt-4o",
      aiProvider: "openai",
      email: "user@test.com",
      openAIApiKey: null,
      about: null,
    },
  });

  expect(result).toEqual({ rule, reason: expect.any(String), actionItems: [] });
});
