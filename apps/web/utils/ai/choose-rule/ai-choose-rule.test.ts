import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGenerateObject } from "@/utils/llms";
import {
  createTestLogger,
  getEmail,
  getEmailAccount,
} from "@/__tests__/helpers";
import { aiChooseRule } from "./ai-choose-rule";

vi.mock("@/utils/llms", () => ({
  createGenerateObject: vi.fn(),
}));
vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({ provider: "openai", model: "test-model" })),
}));

const generate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createGenerateObject).mockReturnValue(generate as never);
  generate.mockResolvedValue({
    object: { reasoning: "r", ruleName: "Factory", noMatchFound: false },
  });
});

describe("aiChooseRule", () => {
  it("tells the AI when an OR rule's explicit senders don't cover this email", async () => {
    await aiChooseRule({
      email: getEmail({ from: "feedback@drivecentric.com" }),
      rules: [
        {
          name: "Factory",
          instructions: "Customer survey and CSI alert emails",
          from: "@medallia.com, @hmausa.com",
          conditionalOperator: "OR",
        },
      ],
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    const { system } = generate.mock.calls[0][0];
    expect(system).toContain("@medallia.com, @hmausa.com");
    expect(system).toContain("NOT one of them");
  });

  it("adds no sender note for AND rules or rules without explicit senders", async () => {
    await aiChooseRule({
      email: getEmail(),
      rules: [
        {
          name: "Factory",
          instructions: "Customer survey emails",
          from: "@medallia.com",
          conditionalOperator: "AND",
        },
        { name: "Newsletter", instructions: "Newsletters" },
      ],
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    const { system } = generate.mock.calls[0][0];
    expect(system).not.toContain("NOT one of them");
  });

  it("returns the original rule, not the note-enriched prompt copy", async () => {
    const rule = {
      name: "Factory",
      instructions: "Customer survey emails",
      from: "@medallia.com",
      conditionalOperator: "OR",
    };

    const result = await aiChooseRule({
      email: getEmail(),
      rules: [rule],
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    expect(result.rules[0]?.rule).toBe(rule);
    expect(result.rules[0]?.rule.instructions).toBe("Customer survey emails");
  });
});
