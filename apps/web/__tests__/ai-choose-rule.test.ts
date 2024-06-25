import { chooseRule } from "@/utils/ai/choose-rule/choose";
import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

test("Should choose correct rule", async () => {
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

  expect(result).toEqual({ reason: expect.any(String) });
});
