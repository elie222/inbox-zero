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

  it("tells the AI an AND rule's static conditions already matched", async () => {
    await aiChooseRule({
      email: getEmail({ from: "shawn@nucar.com" }),
      rules: [
        {
          name: "GM Responses",
          instructions: "Replies to daily report emails",
          from: "@nucar.com",
          conditionalOperator: "AND",
        },
      ],
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    const { system } = generate.mock.calls[0][0];
    expect(system).toContain("ALREADY MATCHED");
    expect(system).toContain("From: @nucar.com");
    expect(system).not.toContain("NOT one of them");
  });

  it("adds no notes for rules without static conditions", async () => {
    await aiChooseRule({
      email: getEmail(),
      rules: [{ name: "Newsletter", instructions: "Newsletters" }],
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    const { system } = generate.mock.calls[0][0];
    expect(system).not.toContain("NOT one of them");
    expect(system).not.toContain("ALREADY MATCHED");
  });

  it("adds no unmatched-sender note for OR rules with non-sender static fields", async () => {
    await aiChooseRule({
      email: getEmail(),
      rules: [
        {
          name: "Factory",
          instructions: "Customer survey emails",
          from: "@medallia.com",
          subject: "Survey",
          conditionalOperator: "OR",
        },
      ],
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    const { system } = generate.mock.calls[0][0];
    expect(system).not.toContain("NOT one of them");
    expect(system).not.toContain("ALREADY MATCHED");
  });

  it("adds no unmatched-sender note for negated-from OR rules", async () => {
    await aiChooseRule({
      email: getEmail({ from: "shawn@nucar.com" }),
      rules: [
        {
          name: "External mail",
          instructions: "Emails from outside the company",
          from: "@nucar.com",
          fromExclude: true,
          conditionalOperator: "OR",
        },
      ],
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    const { system } = generate.mock.calls[0][0];
    expect(system).not.toContain("NOT one of them");
  });

  it("tells the AI when a rule previously filed this conversation", async () => {
    await aiChooseRule({
      email: getEmail(),
      rules: [
        {
          name: "GM Responses",
          instructions: "Replies to daily report emails",
          previouslyMatchedThread: true,
        },
      ],
      emailAccount: getEmailAccount(),
      logger: createTestLogger(),
    });

    const { system } = generate.mock.calls[0][0];
    expect(system).toContain(
      "already matched earlier messages in this same conversation",
    );
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
