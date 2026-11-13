import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { aiChooseRule } from "./ai-choose-rule";
import { enforceSensitiveDataPolicy } from "@/utils/llms/sensitive-content";
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
        ruleId: null,
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

describe.each([
  false,
  true,
])("rule ID resolution (multi-rule: %s)", (multiRuleSelectionEnabled) => {
  beforeEach(() => vi.clearAllMocks());
  it("maps canonical candidate IDs back to the original rule objects", async () => {
    const candidateRules = [
      { name: "Zulu", instructions: "Second alphabetically" },
      { name: "Alpha", instructions: "First alphabetically" },
    ];
    mockStructuredResponse({
      reasoning: "First rule matches",
      ruleId: "rule-1",
      matchedRules: [{ ruleId: "rule-1", isPrimary: true }],
      noMatchFound: false,
    });
    const result = await chooseRule(candidateRules, multiRuleSelectionEnabled);
    expect(result.rules).toEqual([
      { rule: candidateRules[1], isPrimary: true },
    ]);
    expect(result.rules[0].rule).toBe(candidateRules[1]);
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
    "rule-3",
    "rule-1 extra",
    "Factures reçues",
    "",
  ])("rejects an unoffered ID %j during structured generation", async (ruleId) => {
    mockStructuredResponse({
      reasoning: "A matching rule",
      noMatchFound: false,
      ruleId,
      matchedRules: [{ ruleId, isPrimary: true }],
    });

    await expect(
      chooseRule(candidateRules, multiRuleSelectionEnabled),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it("returns the exact offered rule and its primary metadata", async () => {
    mockStructuredResponse({
      reasoning: "A paid invoice",
      noMatchFound: false,
      ruleId: "rule-1",
      matchedRules: [{ ruleId: "rule-1", isPrimary: true }],
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
      ruleId: null,
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

describe.each([
  false,
  true,
])("rule selection redaction (multi-rule: %s)", (multiRuleSelectionEnabled) => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps sensitive names out of the schema and resolves the original rule after redaction", async () => {
    const secret = "x".repeat(24);
    const card = "4242 4242 4242 4242";
    const candidateRules = [
      { name: `A api_key=${secret}`, instructions: "Invoices" },
      { name: `B card ${card}`, instructions: "Receipts" },
    ];
    generateObjectSpy.mockImplementation(async (options) => {
      const protectedOptions = enforceSensitiveDataPolicy({
        options,
        policy: "REDACT",
        logger,
        label: "Choose rule",
      });
      const providerRequest = JSON.stringify({
        instructions: protectedOptions.instructions,
        prompt: protectedOptions.prompt,
        schema: z.toJSONSchema(protectedOptions.schema),
      });
      expect(providerRequest).not.toContain(secret);
      expect(providerRequest).not.toContain(card);
      expect(providerRequest).toContain("[REDACTED:CREDENTIAL]");
      expect(providerRequest).toContain("[REDACTED:PAYMENT_CARD]");
      expect(protectedOptions.instructions).toContain("<id>rule-1</id>");
      return {
        object: protectedOptions.schema.parse({
          reasoning: "An invoice",
          noMatchFound: false,
          ruleId: "rule-1",
          matchedRules: [{ ruleId: "rule-1", isPrimary: true }],
        }),
      };
    });
    const result = await aiChooseRule({
      email: getEmail(),
      rules: candidateRules,
      emailAccount: getEmailAccount({
        multiRuleSelectionEnabled,
        sensitiveDataPolicy: "REDACT",
      }),
      logger,
    });
    expect(result.rules).toEqual([
      { rule: candidateRules[0], isPrimary: true },
    ]);
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
      object: { reasoning: "r", ruleId: "Other", noMatchFound: false },
    });

    await expect(chooseRule(candidateRules)).rejects.toThrow(UNRESOLVED_ERROR);
  });

  it("rejects a multi-rule response where no returned rule was offered", async () => {
    generateObjectSpy.mockResolvedValue({
      object: {
        reasoning: "r",
        noMatchFound: false,
        matchedRules: [{ ruleId: "Other", isPrimary: true }],
      },
    });

    await expect(chooseRule(candidateRules, true)).rejects.toThrow(
      UNRESOLVED_ERROR,
    );
  });

  it("rejects a claimed match with no rule ID in a single-rule response", async () => {
    generateObjectSpy.mockResolvedValue({
      object: { reasoning: "r", ruleId: "", noMatchFound: false },
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

  it("keeps the offered rules when only some returned IDs resolve", async () => {
    generateObjectSpy.mockResolvedValue({
      object: {
        reasoning: "r",
        noMatchFound: false,
        matchedRules: [
          { ruleId: "rule-2", isPrimary: true },
          { ruleId: "Other", isPrimary: false },
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
        ruleId: null,
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
