import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestLogger,
  getEmailAccount,
  getMockMessage,
} from "@/__tests__/helpers";
import type { ParsedMessage } from "@/utils/types";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { CONVERSATION_TRACKING_META_RULE_ID } from "@/utils/reply-tracker/conversation-status-config";
import { getRuleConfig } from "@/utils/rule/consts";

const classifyMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/classifier/classify", () => ({ classify: classifyMock }));

import { classifierChooseRule } from "./classifier-choose-rule";

const logger = createTestLogger();
const CHOICE_KEY = "__rule_choice__";
const COLD_KEY = "__cold_email__";
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
  {
    confidence = 0.9,
    probabilities,
    ruleApplies = {} as Record<string, number>,
    cold,
  }: {
    confidence?: number;
    probabilities?: Record<string, number>;
    ruleApplies?: Record<string, number>;
    cold?: number;
  } = {},
) {
  classifyMock.mockResolvedValue({
    model: "test-model",
    inputTokens: 10,
    answers: {
      [CHOICE_KEY]: {
        type: "choice",
        choice,
        confidence,
        probabilities: probabilities ?? { [choice]: confidence },
      },
      ...(cold === undefined
        ? {}
        : { [COLD_KEY]: { type: "yesNo", probability: cold } }),
      ...Object.fromEntries(
        Object.entries(ruleApplies).map(([key, probability]) => [
          key,
          { type: "yesNo", probability },
        ]),
      ),
    },
  });
}

/** The answer a top probability implies when nothing else is on offer. */
function spread(probabilities: Record<string, number>) {
  const [choice] = Object.entries(probabilities).sort(
    (a, b) => b[1] - a[1],
  )[0]!;
  return { choice, probabilities };
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

const conversationRule = {
  id: CONVERSATION_TRACKING_META_RULE_ID,
  name: "Conversations",
  instructions: "Conversations with real people",
};
const systemNewsletterRule = { ...newsletterRule, systemType: "NEWSLETTER" };
const systemMarketingRule = {
  id: "r3",
  name: "Marketing",
  instructions: "Marketing",
  systemType: "MARKETING",
};
const systemNotificationRule = {
  id: "r4",
  name: "Notification",
  instructions: getRuleConfig("NOTIFICATION").instructions,
  systemType: "NOTIFICATION",
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
      type: "rules",
      rules: [{ rule: receiptRule, isPrimary: true }],
      reason: 'Classifier chose "Receipts" (confidence 0.80)',
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

    expect(result).toEqual({
      type: "rules",
      rules: [],
      reason: 'Classifier chose "None" (confidence 0.90)',
    });
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
    expect(result.type === "rules" && result.rules[0]?.rule).toBe(second);
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

  describe("cold email", () => {
    it("asks it as its own yes/no, never as a rule to choose", async () => {
      mockAnswer("Receipts", { cold: 0.1 });

      await chooseRule({ coldEmailRule: { instructions: null } });

      expect(Object.keys(getRequest().questions)).toEqual([
        CHOICE_KEY,
        COLD_KEY,
      ]);
      expect(getRequest().questions[COLD_KEY].type).toBe("yesNo");
      expect(
        Object.keys(getRequest().questions[CHOICE_KEY].criteria),
      ).not.toContain("Cold Email");
    });

    it("asks the whole cold-email prompt, not its opening paragraph", async () => {
      mockAnswer("None", { cold: 0.1 });

      for (const instructions of [null, "", DEFAULT_COLD_EMAIL_PROMPT]) {
        await chooseRule({ coldEmailRule: { instructions } });
      }

      // The paragraphs that spell out what is not cold outreach are what keep
      // ordinary bulk mail from being flagged.
      for (const callIndex of [0, 1, 2]) {
        expect(
          getRequest(callIndex).questions[COLD_KEY].instructions,
        ).toContain(DEFAULT_COLD_EMAIL_PROMPT);
      }
    });

    it("passes a customised cold-email prompt through", async () => {
      mockAnswer("None", { cold: 0.1 });

      await chooseRule({
        coldEmailRule: { instructions: "Unsolicited outreach" },
      });

      expect(getRequest().questions[COLD_KEY].instructions).toContain(
        "Unsolicited outreach",
      );
      expect(getRequest().questions[COLD_KEY].instructions).not.toContain(
        DEFAULT_COLD_EMAIL_PROMPT,
      );
    });

    it("flags cold email above the threshold", async () => {
      mockAnswer("Receipts", { cold: 0.8 });

      const result = await chooseRule({
        coldEmailRule: { instructions: null },
      });

      expect(result).toEqual({
        type: "coldEmail",
        reason: "Classifier says cold email (confidence 0.80)",
      });
    });

    it("keeps the rule choice when cold email only just clears a coin flip", async () => {
      mockAnswer("Receipts", { confidence: 0.8, cold: 0.6 });

      const result = await chooseRule({
        coldEmailRule: { instructions: null },
      });

      expect(result.type).toBe("rules");
    });

    it("answers only the cold question when there is no rule to choose", async () => {
      classifyMock.mockResolvedValue({
        model: "test-model",
        inputTokens: 10,
        answers: { [COLD_KEY]: { type: "yesNo", probability: 0.2 } },
      });

      const result = await chooseRule({
        rules: [],
        coldEmailRule: { instructions: null },
      });

      expect(Object.keys(getRequest().questions)).toEqual([COLD_KEY]);
      expect(result).toEqual({
        type: "rules",
        rules: [],
        reason: "Classifier says not cold",
      });
    });

    it("throws when the cold answer is missing, so the caller falls back", async () => {
      mockAnswer("Receipts");

      await expect(
        chooseRule({ coldEmailRule: { instructions: null } }),
      ).rejects.toThrow("missing the cold email answer");
    });
  });

  describe("reading the probabilities", () => {
    const contentRules = [
      systemNewsletterRule,
      systemMarketingRule,
      conversationRule,
    ];

    it("prefers the content rules when they outweigh Conversations together", async () => {
      // Conversations is the single highest answer, but the content rules hold
      // 0.55 between them.
      classifyMock.mockResolvedValue({
        model: "test-model",
        inputTokens: 10,
        answers: {
          [CHOICE_KEY]: {
            type: "choice",
            confidence: 0.4,
            ...spread({
              Conversations: 0.4,
              Newsletter: 0.15,
              Marketing: 0.4,
              None: 0.05,
            }),
            choice: "Conversations",
          },
        },
      });

      const result = await chooseRule({ rules: contentRules });

      expect(result).toEqual({
        type: "rules",
        rules: [{ rule: systemMarketingRule, isPrimary: true }],
        reason: 'Classifier chose "Marketing" (confidence 0.40)',
      });
    });

    it("keeps Conversations when it outweighs the content rules together", async () => {
      mockAnswer("Conversations", {
        confidence: 0.6,
        probabilities: {
          Conversations: 0.6,
          Newsletter: 0.2,
          Marketing: 0.15,
          None: 0.05,
        },
      });

      const result = await chooseRule({ rules: contentRules });

      expect(result).toEqual({
        type: "rules",
        rules: [{ rule: conversationRule, isPrimary: true }],
        reason: 'Classifier chose "Conversations" (confidence 0.60)',
      });
    });

    it("defers to the LLM when conversation and content are a dead heat", async () => {
      mockAnswer("Conversations", {
        confidence: 0.51,
        probabilities: {
          Conversations: 0.51,
          Newsletter: 0.29,
          Marketing: 0.2,
        },
      });

      const result = await chooseRule({ rules: contentRules });

      expect(result).toEqual({
        type: "undecided",
        reason: "Classifier was too close to call (margin 0.02)",
      });
    });

    it("defers to the LLM when the top two content rules are a dead heat", async () => {
      mockAnswer("Marketing", {
        confidence: 0.45,
        probabilities: {
          Conversations: 0.1,
          Newsletter: 0.42,
          Marketing: 0.45,
          None: 0.03,
        },
      });

      const result = await chooseRule({ rules: contentRules });

      expect(result).toEqual({
        type: "undecided",
        reason: "Classifier was too close to call (margin 0.03)",
      });
    });

    it("leaves a custom rule that wins on its own alone", async () => {
      const customRule = { id: "c1", name: "Invoices", instructions: "Mine" };
      mockAnswer("Invoices", {
        confidence: 0.4,
        probabilities: {
          Invoices: 0.4,
          Conversations: 0.3,
          Newsletter: 0.15,
          Marketing: 0.15,
        },
      });

      const result = await chooseRule({
        rules: [...contentRules, customRule],
      });

      expect(result).toEqual({
        type: "rules",
        rules: [{ rule: customRule, isPrimary: true }],
        reason: 'Classifier chose "Invoices" (confidence 0.40)',
      });
    });

    it("does not compare totals when Conversations is not on offer", async () => {
      mockAnswer("Newsletter", {
        confidence: 0.52,
        probabilities: { Newsletter: 0.52, Marketing: 0.48 },
      });

      const result = await chooseRule({
        rules: [systemNewsletterRule, systemMarketingRule],
      });

      expect(result.type).toBe("rules");
    });
  });

  describe("the Notification criterion", () => {
    it("replaces the default wording, for the classifier only", async () => {
      mockAnswer("None");

      await chooseRule({ rules: [systemNotificationRule] });

      const criterion =
        getRequest().questions[CHOICE_KEY].criteria.Notification;
      expect(criterion).not.toBe(systemNotificationRule.instructions);
      expect(criterion.length).toBeGreaterThan(
        systemNotificationRule.instructions.length,
      );
    });

    it("leaves wording the owner customised alone", async () => {
      mockAnswer("None");

      await chooseRule({
        rules: [
          { ...systemNotificationRule, instructions: "Only build alerts" },
        ],
      });

      expect(getRequest().questions[CHOICE_KEY].criteria.Notification).toBe(
        "Only build alerts",
      );
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
      expect(result.type === "rules" && result.rules).toEqual([
        { rule: receiptRule, isPrimary: true },
        { rule: newsletterRule, isPrimary: false },
      ]);
    });

    it("never adds system rules as secondary matches", async () => {
      const calendarRule = {
        id: "r5",
        name: "Calendar",
        instructions: "Calendar invites",
        systemType: "CALENDAR",
      };
      mockAnswer("Receipts", {
        ruleApplies: { Newsletter: 0.9, Receipts: 0.95, Calendar: 0.9 },
      });

      const result = await chooseRule({
        emailAccount: multiRuleAccount,
        rules: [...customRules, calendarRule],
      });

      expect(Object.keys(getRequest().questions)).toEqual([
        "Newsletter",
        "Receipts",
        CHOICE_KEY,
      ]);
      expect(result.type === "rules" && result.rules).toEqual([
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

      expect(result.type === "rules" && result.rules).toEqual([
        { rule: receiptRule, isPrimary: true },
      ]);
    });

    it("returns no rules when the choice is None, whatever the yes/no answers", async () => {
      mockAnswer("None", { ruleApplies: { Newsletter: 0.9, Receipts: 0.9 } });

      const result = await chooseRule({
        emailAccount: multiRuleAccount,
        rules: customRules,
      });

      expect(result.type === "rules" && result.rules).toEqual([]);
    });

    it("asks only the choice when every candidate is a system rule", async () => {
      mockAnswer("Newsletter");

      await chooseRule({
        emailAccount: multiRuleAccount,
        rules: [systemNewsletterRule],
      });

      expect(Object.keys(getRequest().questions)).toEqual([CHOICE_KEY]);
    });
  });
});
