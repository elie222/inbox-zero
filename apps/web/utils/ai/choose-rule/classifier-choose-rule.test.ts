import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestLogger,
  getEmailAccount,
  getMockMessage,
} from "@/__tests__/helpers";
import type { ParsedMessage } from "@/utils/types";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";

const classifyMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/classifier/classify", () => ({ classify: classifyMock }));

import { classifierChooseRule } from "./classifier-choose-rule";

const logger = createTestLogger();
const CHOICE_KEY = "__rule_choice__";
const classifier = {
  provider: "typesafe" as const,
  model: "test-model",
  apiKey: "test-key",
};

function getMessage(overrides: Parameters<typeof getMockMessage>[0] = {}) {
  return getMockMessage(overrides) as unknown as ParsedMessage;
}

function mockAnswer(
  choice: string,
  { confidence = 0.9, ruleApplies = {} as Record<string, number> } = {},
) {
  classifyMock.mockResolvedValue({
    model: "test-model",
    inputTokens: 10,
    answers: {
      [CHOICE_KEY]: {
        type: "choice",
        choice,
        confidence,
        probabilities: { [choice]: confidence },
      },
      ...Object.fromEntries(
        Object.entries(ruleApplies).map(([key, probability]) => [
          key,
          { type: "yesNo", probability },
        ]),
      ),
    },
  });
}

function getRequest(callIndex = 0) {
  return classifyMock.mock.calls[callIndex]?.[0];
}

const newsletterRule = {
  id: "r1",
  name: "Newsletter",
  instructions: "Newsletters",
};
const receiptRule = {
  id: "r2",
  name: "Receipts",
  instructions: "Receipts and invoices",
};

function chooseRule(
  overrides: Partial<Parameters<typeof classifierChooseRule>[0]> = {},
) {
  return classifierChooseRule({
    classifier,
    message: getMessage(),
    emailAccount: getEmailAccount(),
    rules: [newsletterRule, receiptRule],
    coldEmailRule: null,
    classificationFeedback: null,
    logger,
    ...overrides,
  });
}

describe("classifierChooseRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the chosen key back to the rule", async () => {
    mockAnswer("Receipts", { confidence: 0.8 });

    const result = await chooseRule();

    expect(result).toEqual({
      rules: [{ rule: receiptRule, isPrimary: true }],
      reason: 'Classifier chose "Receipts" (confidence 0.80)',
      isColdEmail: false,
    });
    expect(Object.keys(getRequest().questions)).toEqual([CHOICE_KEY]);
    expect(getRequest().questions[CHOICE_KEY].criteria).toEqual({
      Newsletter: "Newsletters",
      Receipts: "Receipts and invoices",
      None: "None of the rules apply to this email",
    });
  });

  it("returns no rules for None", async () => {
    mockAnswer("None");

    const result = await chooseRule();

    expect(result.rules).toEqual([]);
    expect(result.isColdEmail).toBe(false);
  });

  it("flags cold email when that option is chosen", async () => {
    mockAnswer("Cold Email");

    const result = await chooseRule({
      coldEmailRule: { instructions: "Unsolicited outreach" },
    });

    expect(result.rules).toEqual([]);
    expect(result.isColdEmail).toBe(true);
    expect(getRequest().questions[CHOICE_KEY].criteria["Cold Email"]).toBe(
      "Unsolicited outreach",
    );
  });

  it("cuts the default cold-email prompt to its opening paragraph", async () => {
    mockAnswer("None");

    for (const instructions of [null, "", DEFAULT_COLD_EMAIL_PROMPT]) {
      await chooseRule({ coldEmailRule: { instructions } });
    }

    const criteria = [0, 1, 2].map(
      (callIndex) =>
        getRequest(callIndex).questions[CHOICE_KEY].criteria["Cold Email"],
    );
    const openingParagraph = DEFAULT_COLD_EMAIL_PROMPT.split(/\n\s*\n/)[0];
    expect(criteria).toEqual([
      openingParagraph,
      openingParagraph,
      openingParagraph,
    ]);
  });

  it("throws on a choice that was not offered, so the caller falls back", async () => {
    mockAnswer("Invented rule");

    await expect(chooseRule()).rejects.toThrow("not offered");
  });

  it("disambiguates duplicate rule names", async () => {
    const first = { id: "a", name: "Follow up", instructions: "First" };
    const second = { id: "b", name: "follow up", instructions: "Second" };
    mockAnswer("follow up (2)");

    const result = await chooseRule({ rules: [first, second] });

    expect(Object.keys(getRequest().questions[CHOICE_KEY].criteria)).toEqual([
      "Follow up",
      "follow up (2)",
      "None",
    ]);
    expect(result.rules[0]?.rule).toBe(second);
  });

  it("sends the latest message, account owner, and sender corrections", async () => {
    mockAnswer("None");

    await chooseRule({
      emailAccount: { ...getEmailAccount(), about: "I run a bakery" },
      classificationFeedback: [
        { subject: "Order #1", ruleName: "Receipts", eventType: "LABEL_ADDED" },
        {
          subject: "Weekly digest",
          ruleName: "Newsletter",
          eventType: "LABEL_REMOVED",
        },
      ],
    });

    expect(getRequest().state).toEqual({
      accountOwner: { email: "user@test.com", about: "I run a bakery" },
      email: expect.objectContaining({
        from: "test@example.com",
        subject: "Test",
        content: "Test content",
        hasListUnsubscribeHeader: false,
      }),
      ownerCorrectionsForThisSender: [
        { subject: "Order #1", rule: "Receipts", ownerAction: "applied rule" },
        {
          subject: "Weekly digest",
          rule: "Newsletter",
          ownerAction: "removed rule",
        },
      ],
    });
  });

  describe("with multi-rule selection", () => {
    const customRules = [newsletterRule, receiptRule];
    const multiRuleAccount = getEmailAccount({
      multiRuleSelectionEnabled: true,
    });

    it("adds other rules that clear the yes/no threshold", async () => {
      mockAnswer("Receipts", {
        ruleApplies: { Newsletter: 0.7, Receipts: 0.95 },
      });

      const result = await chooseRule({
        emailAccount: multiRuleAccount,
        rules: customRules,
      });

      expect(Object.keys(getRequest().questions)).toEqual([
        "Newsletter",
        "Receipts",
        CHOICE_KEY,
      ]);
      expect(getRequest().questions.Newsletter.type).toBe("yesNo");
      expect(result.rules).toEqual([
        { rule: receiptRule, isPrimary: true },
        { rule: newsletterRule, isPrimary: false },
      ]);
    });

    it("keeps only the primary rule when the others fall below the threshold", async () => {
      mockAnswer("Receipts", {
        ruleApplies: { Newsletter: 0.2, Receipts: 0.95 },
      });

      const result = await chooseRule({
        emailAccount: multiRuleAccount,
        rules: customRules,
      });

      expect(result.rules).toEqual([{ rule: receiptRule, isPrimary: true }]);
    });

    it("returns no rules when the choice is None, whatever the yes/no answers", async () => {
      mockAnswer("None", { ruleApplies: { Newsletter: 0.9, Receipts: 0.9 } });

      const result = await chooseRule({
        emailAccount: multiRuleAccount,
        rules: customRules,
      });

      expect(result.rules).toEqual([]);
    });

    it("asks only the choice when every candidate is a system rule", async () => {
      mockAnswer("Newsletter");

      await chooseRule({
        emailAccount: multiRuleAccount,
        rules: [{ ...newsletterRule, systemType: "NEWSLETTER" }],
      });

      expect(Object.keys(getRequest().questions)).toEqual([CHOICE_KEY]);
    });
  });
});
