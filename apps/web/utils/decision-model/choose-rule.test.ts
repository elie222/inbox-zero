import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestLogger,
  getEmailAccount,
  getMockMessage,
} from "@/__tests__/helpers";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { CONVERSATION_TRACKING_META_RULE_ID } from "@/utils/reply-tracker/conversation-status-config";
import { getRuleConfig } from "@/utils/rule/consts";
import type { ParsedMessage } from "@/utils/types";

const runDecisionModelMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/decision-model/decision-model", () => ({
  runDecisionModel: runDecisionModelMock,
}));

import { decisionModelChooseRule } from "./choose-rule";

const logger = createTestLogger();
const CHOICE_KEY = "__rule_choice__";
const COLD_KEY = "__cold_email__";
const decisionModel = {
  provider: "typesafe" as const,
  model: "test-model",
  apiKey: "test-key",
};

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

describe("decisionModelChooseRule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps the chosen key back to the rule", async () => {
    mockAnswer("Receipts", { confidence: 0.8 });

    expect(await chooseRule()).toEqual({
      type: "rules",
      rules: [{ rule: receiptRule, isPrimary: true }],
      reason: 'Decision model chose "Receipts" (confidence 0.80)',
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
    expect(await chooseRule()).toEqual({
      type: "rules",
      rules: [],
      reason: 'Decision model chose "None" (confidence 0.90)',
    });
  });

  it("throws on a choice that was not offered", async () => {
    mockAnswer("Invented rule");
    await expect(chooseRule()).rejects.toThrow("not offered");
  });

  it("falls back when the choice confidence is too low", async () => {
    mockAnswer("Receipts", { confidence: 0.29 });
    await expect(chooseRule()).rejects.toThrow("confidence is too low");
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

  it("sends the latest email, account owner, and sender corrections", async () => {
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
      candidateRules: [
        { name: "Newsletter", instructions: "Newsletters" },
        { name: "Receipts", instructions: "Receipts and invoices" },
      ],
      coldEmailDefinition: null,
    });
  });

  it("leaves multi-rule selection on the LLM path", async () => {
    await expect(
      chooseRule({
        emailAccount: getEmailAccount({ multiRuleSelectionEnabled: true }),
      }),
    ).rejects.toThrow("does not support multi-rule selection");
    expect(runDecisionModelMock).not.toHaveBeenCalled();
  });

  describe("cold email", () => {
    it("asks a separate yes/no question rather than adding a choice", async () => {
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

    it("uses the whole default definition, including exclusions", async () => {
      mockAnswer("None", { cold: 0.1 });
      for (const instructions of [null, "", DEFAULT_COLD_EMAIL_PROMPT]) {
        await chooseRule({ coldEmailRule: { instructions } });
      }
      for (const callIndex of [0, 1, 2]) {
        expect(getRequest(callIndex).state.coldEmailDefinition).toBe(
          DEFAULT_COLD_EMAIL_PROMPT,
        );
      }
    });

    it("preserves custom cold-email instructions", async () => {
      mockAnswer("None", { cold: 0.1 });
      await chooseRule({
        coldEmailRule: { instructions: "Unsolicited outreach" },
      });
      expect(getRequest().state.coldEmailDefinition).toBe(
        "Unsolicited outreach",
      );
    });

    it("flags cold email above the threshold", async () => {
      mockAnswer("Receipts", { cold: 0.8 });
      expect(
        await chooseRule({ coldEmailRule: { instructions: null } }),
      ).toEqual({
        type: "coldEmail",
        reason: "Decision model says cold email (confidence 0.80)",
      });
    });

    it("keeps the rule choice when cold email barely clears a coin flip", async () => {
      mockAnswer("Receipts", { confidence: 0.8, cold: 0.6 });
      const result = await chooseRule({
        coldEmailRule: { instructions: null },
      });
      expect(result.type).toBe("rules");
    });

    it("answers only the cold question when there are no rules", async () => {
      runDecisionModelMock.mockResolvedValue({
        model: "test-model",
        inputTokens: 10,
        outputTokens: 1,
        answers: { [COLD_KEY]: { type: "yesNo", probability: 0.2 } },
      });
      expect(
        await chooseRule({
          rules: [],
          coldEmailRule: { instructions: null },
        }),
      ).toEqual({
        type: "rules",
        rules: [],
        reason: "Decision model says not cold",
      });
      expect(Object.keys(getRequest().questions)).toEqual([COLD_KEY]);
    });

    it("throws when the cold answer is missing", async () => {
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

    it("prefers content when the content rules outweigh Conversations together", async () => {
      mockAnswer("Conversations", {
        confidence: 0.4,
        probabilities: {
          Conversations: 0.4,
          Newsletter: 0.15,
          Marketing: 0.4,
          None: 0.05,
        },
      });
      expect(await chooseRule({ rules: contentRules })).toEqual({
        type: "rules",
        rules: [{ rule: systemMarketingRule, isPrimary: true }],
        reason: 'Decision model chose "Marketing" (confidence 0.40)',
      });
    });

    it("falls back when the aggregated winner is below the confidence threshold", async () => {
      mockAnswer("Conversations", {
        confidence: 0.4,
        probabilities: {
          Conversations: 0.4,
          Newsletter: 0.29,
          Marketing: 0.16,
          Notification: 0.15,
        },
      });

      await expect(
        chooseRule({ rules: [...contentRules, systemNotificationRule] }),
      ).rejects.toThrow("confidence is too low");
    });

    it("keeps Conversations when it outweighs content together", async () => {
      mockAnswer("Conversations", {
        confidence: 0.6,
        probabilities: {
          Conversations: 0.6,
          Newsletter: 0.2,
          Marketing: 0.15,
          None: 0.05,
        },
      });
      expect(await chooseRule({ rules: contentRules })).toEqual({
        type: "rules",
        rules: [{ rule: conversationRule, isPrimary: true }],
        reason: 'Decision model chose "Conversations" (confidence 0.60)',
      });
    });

    it("defers when conversation and content are a dead heat", async () => {
      mockAnswer("Conversations", {
        confidence: 0.51,
        probabilities: {
          Conversations: 0.51,
          Newsletter: 0.29,
          Marketing: 0.2,
        },
      });
      expect(await chooseRule({ rules: contentRules })).toEqual({
        type: "undecided",
        reason: "Decision model was too close to call (margin 0.02)",
      });
    });

    it("defers when the top content rules are a dead heat", async () => {
      mockAnswer("Marketing", {
        confidence: 0.45,
        probabilities: {
          Conversations: 0.1,
          Newsletter: 0.42,
          Marketing: 0.45,
          None: 0.03,
        },
      });
      expect(await chooseRule({ rules: contentRules })).toEqual({
        type: "undecided",
        reason: "Decision model was too close to call (margin 0.03)",
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
      expect(
        await chooseRule({ rules: [...contentRules, customRule] }),
      ).toEqual({
        type: "rules",
        rules: [{ rule: customRule, isPrimary: true }],
        reason: 'Decision model chose "Invoices" (confidence 0.40)',
      });
    });

    it("does not compare totals when Conversations is absent", async () => {
      mockAnswer("Newsletter", {
        confidence: 0.52,
        probabilities: { Newsletter: 0.52, Marketing: 0.48 },
      });
      expect(
        (
          await chooseRule({
            rules: [systemNewsletterRule, systemMarketingRule],
          })
        ).type,
      ).toBe("rules");
    });
  });

  describe("Notification criterion", () => {
    it("replaces only the default wording", async () => {
      mockAnswer("None");
      await chooseRule({ rules: [systemNotificationRule] });
      const criterion =
        getRequest().questions[CHOICE_KEY].criteria.Notification;
      expect(criterion).not.toBe(systemNotificationRule.instructions);
      expect(criterion.length).toBeGreaterThan(
        systemNotificationRule.instructions.length,
      );
    });

    it("preserves wording the owner customized", async () => {
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
});

function mockAnswer(
  choice: string,
  {
    confidence = 0.9,
    probabilities,
    cold,
  }: {
    confidence?: number;
    probabilities?: Record<string, number>;
    cold?: number;
  } = {},
) {
  runDecisionModelMock.mockResolvedValue({
    model: "test-model",
    inputTokens: 10,
    outputTokens: 1,
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
    },
  });
}

function getRequest(callIndex = 0) {
  return runDecisionModelMock.mock.calls[callIndex]?.[0];
}

function chooseRule(
  overrides: Partial<Parameters<typeof decisionModelChooseRule>[0]> = {},
) {
  return decisionModelChooseRule({
    decisionModel,
    message: getMockMessage() as unknown as ParsedMessage,
    emailAccount: getEmailAccount(),
    rules: [newsletterRule, receiptRule],
    coldEmailRule: null,
    classificationFeedback: null,
    logger,
    ...overrides,
  });
}
