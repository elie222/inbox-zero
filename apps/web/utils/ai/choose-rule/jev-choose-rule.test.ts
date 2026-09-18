import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestLogger,
  getEmailAccount,
  getMockMessage,
} from "@/__tests__/helpers";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";

const envMock = vi.hoisted(() => ({
  TYPESAFE_API_KEY: "typesafe-key",
  JEV_RULE_SELECTION_ENABLED: true,
}));
const systemOneMock = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@typesafe-ai/sdk", () => ({
  TypeSafeClient: class {
    systemOne = systemOneMock;
  },
  choice: (instructions: string, criteria: Record<string, string>) => ({
    type: "choice",
    instructions,
    criteria,
  }),
}));

import { isJevRuleSelectionEnabled, jevChooseRule } from "./jev-choose-rule";

const logger = createTestLogger();

function getProvider(overrides: Partial<EmailProvider> = {}) {
  return {
    isReplyInThread: vi.fn().mockReturnValue(false),
    getThreadMessages: vi.fn().mockResolvedValue([]),
    isSentMessage: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as EmailProvider;
}

function getMessage(overrides: Parameters<typeof getMockMessage>[0] = {}) {
  return getMockMessage(overrides) as unknown as ParsedMessage;
}

function mockAnswer(choice: string, confidence = 0.9) {
  systemOneMock.mockResolvedValue({
    model: "jev-test",
    usage: { input_tokens: 10, output_tokens: 1 },
    answers: {
      label: {
        type: "choice",
        choice,
        confidence,
        probabilities: { [choice]: confidence },
      },
    },
  });
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

describe("jevChooseRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.TYPESAFE_API_KEY = "typesafe-key";
    envMock.JEV_RULE_SELECTION_ENABLED = true;
  });

  it("maps the chosen key back to the rule", async () => {
    mockAnswer("Receipts", 0.8);

    const result = await jevChooseRule({
      message: getMessage(),
      provider: getProvider(),
      emailAccount: getEmailAccount(),
      rules: [newsletterRule, receiptRule],
      coldEmailOption: null,
      logger,
    });

    expect(result).toEqual({
      rules: [{ rule: receiptRule, isPrimary: true }],
      reason: 'Jev chose "Receipts" (confidence 0.80)',
      isColdEmail: false,
    });

    const request = systemOneMock.mock.calls[0]?.[0];
    expect(request.questions.label.criteria).toEqual({
      Newsletter: "Newsletters",
      Receipts: "Receipts and invoices",
      None: "None of the rules apply to this email",
    });
    expect(request.state).toMatchObject({
      iSentTheLastMessage: false,
      messages: [expect.objectContaining({ from: "test@example.com" })],
    });
  });

  it("returns no rules for None", async () => {
    mockAnswer("None");

    const result = await jevChooseRule({
      message: getMessage(),
      provider: getProvider(),
      emailAccount: getEmailAccount(),
      rules: [newsletterRule],
      coldEmailOption: null,
      logger,
    });

    expect(result.rules).toEqual([]);
    expect(result.isColdEmail).toBe(false);
  });

  it("flags cold email when that option is chosen", async () => {
    mockAnswer("Cold Email");

    const result = await jevChooseRule({
      message: getMessage(),
      provider: getProvider(),
      emailAccount: getEmailAccount(),
      rules: [newsletterRule],
      coldEmailOption: { instructions: "Unsolicited outreach" },
      logger,
    });

    expect(result.rules).toEqual([]);
    expect(result.isColdEmail).toBe(true);
    const request = systemOneMock.mock.calls[0]?.[0];
    expect(request.questions.label.criteria["Cold Email"]).toBe(
      "Unsolicited outreach",
    );
  });

  it("disambiguates duplicate rule names", async () => {
    const first = { id: "a", name: "Follow up", instructions: "First" };
    const second = { id: "b", name: "follow up", instructions: "Second" };
    mockAnswer("follow up (2)");

    const result = await jevChooseRule({
      message: getMessage(),
      provider: getProvider(),
      emailAccount: getEmailAccount(),
      rules: [first, second],
      coldEmailOption: null,
      logger,
    });

    const request = systemOneMock.mock.calls[0]?.[0];
    expect(Object.keys(request.questions.label.criteria)).toEqual([
      "Follow up",
      "follow up (2)",
      "None",
    ]);
    expect(result.rules[0]?.rule).toBe(second);
  });

  it("builds thread state and marks sent messages as me", async () => {
    const earlier = getMessage({ id: "m0", from: "them@example.com" });
    const incoming = getMessage({ id: "m1", from: "them@example.com" });
    const provider = getProvider({
      isReplyInThread: vi.fn().mockReturnValue(true),
      getThreadMessages: vi.fn().mockResolvedValue([earlier]),
      isSentMessage: vi.fn((m: ParsedMessage) => m.id === "m0"),
    });
    mockAnswer("None");

    await jevChooseRule({
      message: incoming,
      provider,
      emailAccount: getEmailAccount(),
      rules: [newsletterRule],
      coldEmailOption: null,
      logger,
    });

    const request = systemOneMock.mock.calls[0]?.[0];
    expect(request.state.messages).toHaveLength(2);
    expect(request.state.messages[0].from).toBe("me");
    expect(request.state.messages[1].from).toBe("them@example.com");
    expect(request.state.iSentTheLastMessage).toBe(false);
  });

  it("falls back to the single message when the thread fetch fails", async () => {
    const provider = getProvider({
      isReplyInThread: vi.fn().mockReturnValue(true),
      getThreadMessages: vi.fn().mockRejectedValue(new Error("boom")),
    });
    mockAnswer("None");

    await jevChooseRule({
      message: getMessage(),
      provider,
      emailAccount: getEmailAccount(),
      rules: [newsletterRule],
      coldEmailOption: null,
      logger,
    });

    const request = systemOneMock.mock.calls[0]?.[0];
    expect(request.state.messages).toHaveLength(1);
  });

  it("rethrows SDK errors as plain errors", async () => {
    systemOneMock.mockRejectedValue(new Error("rate limited"));

    await expect(
      jevChooseRule({
        message: getMessage(),
        provider: getProvider(),
        emailAccount: getEmailAccount(),
        rules: [newsletterRule],
        coldEmailOption: null,
        logger,
      }),
    ).rejects.toThrow("Jev rule selection failed: rate limited");
  });
});

describe("isJevRuleSelectionEnabled", () => {
  it("requires both the flag and the key", () => {
    envMock.JEV_RULE_SELECTION_ENABLED = true;
    envMock.TYPESAFE_API_KEY = "typesafe-key";
    expect(isJevRuleSelectionEnabled()).toBe(true);

    envMock.JEV_RULE_SELECTION_ENABLED = false;
    expect(isJevRuleSelectionEnabled()).toBe(false);

    envMock.JEV_RULE_SELECTION_ENABLED = true;
    envMock.TYPESAFE_API_KEY = "";
    expect(isJevRuleSelectionEnabled()).toBe(false);
  });
});
