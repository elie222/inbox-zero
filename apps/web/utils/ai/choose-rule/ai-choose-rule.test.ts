import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { aiChooseRule } from "./ai-choose-rule";
import { getEmail, getEmailAccount } from "@/__tests__/helpers";
import type { ClassificationFeedbackItem } from "@/utils/rule/classification-feedback";

const generateObjectSpy = vi.fn();

vi.mock("@/utils/llms", () => ({
  createGenerateObject: vi.fn(() => generateObjectSpy),
}));

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    provider: "anthropic",
    modelName: "claude-test",
    model: {},
    providerOptions: undefined,
  })),
}));

const FEEDBACK_MARKER = "User has manually classified emails from this sender";

const rules = [{ name: "Newsletter", instructions: "Newsletters" }];

const feedbackFor = (subject: string): ClassificationFeedbackItem[] => [
  { subject, ruleName: "Newsletter", eventType: "LABEL_ADDED" },
];

describe.each([
  { label: "single-rule", multiRuleSelectionEnabled: false },
  { label: "multi-rule", multiRuleSelectionEnabled: true },
])("aiChooseRule prompt composition ($label)", ({
  multiRuleSelectionEnabled,
}) => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateObjectSpy.mockResolvedValue({
      object: {
        reasoning: "r",
        ruleName: null,
        noMatchFound: true,
        matchedRules: [],
      },
    });
  });

  it("keeps classification feedback out of the cached system prompt", async () => {
    await runChooseRule({
      multiRuleSelectionEnabled,
      email: getEmail({ from: "a@example.com", subject: "Hello" }),
      classificationFeedback: feedbackFor("Earlier newsletter"),
    });

    const { instructions, prompt } = capturedRequest();
    expect(instructions).not.toContain(FEEDBACK_MARKER);
    expect(prompt).toContain(FEEDBACK_MARKER);
    expect(prompt).toContain("Earlier newsletter");
  });

  it("produces a byte-identical system prompt across different senders", async () => {
    await runChooseRule({
      multiRuleSelectionEnabled,
      email: getEmail({ from: "a@example.com", subject: "First" }),
      classificationFeedback: feedbackFor("Sender A history"),
    });
    const first = capturedRequest().instructions;

    generateObjectSpy.mockClear();

    await runChooseRule({
      multiRuleSelectionEnabled,
      email: getEmail({ from: "b@example.com", subject: "Second" }),
      classificationFeedback: feedbackFor("Sender B history"),
    });
    const second = capturedRequest().instructions;

    expect(second).toBe(first);
  });

  it("omits feedback from the prompt when there is none", async () => {
    await runChooseRule({
      multiRuleSelectionEnabled,
      email: getEmail({ from: "a@example.com" }),
      classificationFeedback: null,
    });

    expect(capturedRequest().prompt).not.toContain(FEEDBACK_MARKER);
  });
});

describe("aiChooseRule rule name resolution", () => {
  const candidateRules = [
    { name: "To Reply", instructions: "Needs a reply" },
    { name: "To Reply Later", instructions: "Reply when free" },
    { name: "Conversations", instructions: "Ongoing threads" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["Conversations", "Conversations"],
    ["conversations", "Conversations"],
    ["Conversations\u00bb, ", "Conversations"],
    ["Conversations', ", "Conversations"],
    ["Conversations}, ", "Conversations"],
    ["Conversations\u00bb, noMatchFound: false}", "Conversations"],
    ['Conversations"', "Conversations"],
    ["Conversations`", "Conversations"],
    ["To Reply Later',", "To Reply Later"],
    ["To Reply',", "To Reply"],
    ["Conversations latest_marker", "Conversations"],
    ["Conversations Ongoing threads", "Conversations"],
    ["To Reply Later extra words", "To Reply Later"],
    ["To Reply\tnow", "To Reply"],
  ])("resolves %j to %s", async (returnedName, expectedRule) => {
    generateObjectSpy.mockResolvedValue({
      object: { reasoning: "r", ruleName: returnedName, noMatchFound: false },
    });

    const result = await chooseRule(candidateRules);

    expect(result.rules.map(({ rule }) => rule.name)).toEqual([expectedRule]);
  });

  it.each([
    "Conversation",
    "Conversationsarchive",
    "To Replying",
    "To",
    "x",
  ])("does not resolve %j to a different rule", async (returnedName) => {
    generateObjectSpy.mockResolvedValue({
      object: { reasoning: "r", ruleName: returnedName, noMatchFound: false },
    });

    await expect(chooseRule(candidateRules)).rejects.toThrow(UNRESOLVED_ERROR);
  });

  it("resolves polluted names in multi-rule responses", async () => {
    generateObjectSpy.mockResolvedValue({
      object: {
        reasoning: "r",
        noMatchFound: false,
        matchedRules: [
          { ruleName: "Conversations},", isPrimary: true },
          { ruleName: "To Reply'", isPrimary: false },
        ],
      },
    });

    const result = await chooseRule(candidateRules, true);

    expect(result.rules).toEqual([
      { rule: candidateRules[2], isPrimary: true },
      { rule: candidateRules[0], isPrimary: false },
    ]);
  });
});

describe.each([
  false,
  true,
])("aiChooseRule structured selection (multi-rule: %s)", (multiRuleSelectionEnabled) => {
  const candidateRules = [
    { name: "Factures reçues", instructions: "Paid invoices" },
    { name: "Team / Updates", instructions: "Team updates" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "Invented rule",
    "Factures reçues extra",
    "",
  ])("rejects an unoffered name %j during structured generation", async (ruleName) => {
    mockStructuredResponse({
      reasoning: "A matching rule",
      noMatchFound: false,
      ruleName,
      matchedRules: [{ ruleName, isPrimary: true }],
    });

    await expect(
      chooseRule(candidateRules, multiRuleSelectionEnabled),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it("returns the exact offered rule and its primary metadata", async () => {
    mockStructuredResponse({
      reasoning: "A paid invoice",
      noMatchFound: false,
      ruleName: candidateRules[0].name,
      matchedRules: [{ ruleName: candidateRules[0].name, isPrimary: true }],
    });

    const result = await chooseRule(candidateRules, multiRuleSelectionEnabled);

    expect(result.rules).toEqual([
      { rule: candidateRules[0], isPrimary: true },
    ]);
  });

  it("allows an explicit no-match response", async () => {
    mockStructuredResponse({
      reasoning: "No rule applies",
      noMatchFound: true,
      ruleName: null,
      matchedRules: [],
    });

    const result = await chooseRule(candidateRules, multiRuleSelectionEnabled);

    expect(result).toEqual({ rules: [], reason: "No rule applies" });
  });

  it("does not generate a selection when no rules are offered", async () => {
    const result = await chooseRule([], multiRuleSelectionEnabled);

    expect(result.rules).toEqual([]);
    expect(generateObjectSpy).not.toHaveBeenCalled();
  });
});

describe("aiChooseRule invalid rule selections", () => {
  const candidateRules = [
    { name: "Allowed A", instructions: "First" },
    { name: "Allowed B", instructions: "Second" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a single-rule response naming a rule that was not offered", async () => {
    generateObjectSpy.mockResolvedValue({
      object: { reasoning: "r", ruleName: "Other", noMatchFound: false },
    });

    await expect(chooseRule(candidateRules)).rejects.toThrow(UNRESOLVED_ERROR);
  });

  it("rejects a multi-rule response where no returned rule was offered", async () => {
    generateObjectSpy.mockResolvedValue({
      object: {
        reasoning: "r",
        noMatchFound: false,
        matchedRules: [{ ruleName: "Other", isPrimary: true }],
      },
    });

    await expect(chooseRule(candidateRules, true)).rejects.toThrow(
      UNRESOLVED_ERROR,
    );
  });

  it("rejects a claimed match with no rule name in a single-rule response", async () => {
    generateObjectSpy.mockResolvedValue({
      object: { reasoning: "r", ruleName: "", noMatchFound: false },
    });

    await expect(chooseRule(candidateRules)).rejects.toThrow(UNRESOLVED_ERROR);
  });

  it("rejects a claimed match with an empty multi-rule list", async () => {
    generateObjectSpy.mockResolvedValue({
      object: { reasoning: "r", noMatchFound: false, matchedRules: [] },
    });

    await expect(chooseRule(candidateRules, true)).rejects.toThrow(
      UNRESOLVED_ERROR,
    );
  });

  it("keeps the offered rules when only some returned names resolve", async () => {
    generateObjectSpy.mockResolvedValue({
      object: {
        reasoning: "r",
        noMatchFound: false,
        matchedRules: [
          { ruleName: "Allowed B", isPrimary: true },
          { ruleName: "Other", isPrimary: false },
        ],
      },
    });

    const result = await chooseRule(candidateRules, true);

    expect(result.rules).toEqual([
      { rule: candidateRules[1], isPrimary: true },
    ]);
  });

  it.each([
    false,
    true,
  ])("still returns no rules when the model reports no match (multi-rule: %s)", async (multiRuleSelectionEnabled) => {
    generateObjectSpy.mockResolvedValue({
      object: {
        reasoning: "Nothing fits",
        ruleName: null,
        noMatchFound: true,
        matchedRules: [],
      },
    });

    const result = await chooseRule(candidateRules, multiRuleSelectionEnabled);

    expect(result.rules).toEqual([]);
  });
});

const UNRESOLVED_ERROR = /did not resolve to any offered rule/i;

const logger = createScopedLogger("test-ai-choose-rule");

async function runChooseRule({
  multiRuleSelectionEnabled,
  email,
  classificationFeedback,
}: {
  multiRuleSelectionEnabled: boolean;
  email: ReturnType<typeof getEmail>;
  classificationFeedback: ClassificationFeedbackItem[] | null;
}) {
  await aiChooseRule({
    email,
    rules,
    emailAccount: getEmailAccount({ multiRuleSelectionEnabled }),
    logger,
    classificationFeedback,
  });
}

function capturedRequest(): { instructions: string; prompt: string } {
  const request = generateObjectSpy.mock.calls[0]?.[0];
  return { instructions: request?.instructions, prompt: request?.prompt };
}

async function chooseRule(
  candidateRules: { name: string; instructions: string }[],
  multiRuleSelectionEnabled = false,
) {
  return aiChooseRule({
    email: getEmail(),
    rules: candidateRules,
    emailAccount: getEmailAccount({ multiRuleSelectionEnabled }),
    logger,
  });
}

function mockStructuredResponse(response: unknown) {
  generateObjectSpy.mockImplementation(
    async ({ schema }: { schema: z.ZodType }) => ({
      object: schema.parse(response),
    }),
  );
}
