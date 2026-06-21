import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "@/utils/logger";
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

    const { system, prompt } = capturedRequest();
    expect(system).not.toContain(FEEDBACK_MARKER);
    expect(prompt).toContain(FEEDBACK_MARKER);
    expect(prompt).toContain("Earlier newsletter");
  });

  it("produces a byte-identical system prompt across different senders", async () => {
    await runChooseRule({
      multiRuleSelectionEnabled,
      email: getEmail({ from: "a@example.com", subject: "First" }),
      classificationFeedback: feedbackFor("Sender A history"),
    });
    const first = capturedRequest().system;

    generateObjectSpy.mockClear();

    await runChooseRule({
      multiRuleSelectionEnabled,
      email: getEmail({ from: "b@example.com", subject: "Second" }),
      classificationFeedback: feedbackFor("Sender B history"),
    });
    const second = capturedRequest().system;

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

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  with: vi.fn(() => noopLogger),
} as unknown as Logger;

async function runChooseRule({
  multiRuleSelectionEnabled,
  email,
  classificationFeedback,
}: {
  multiRuleSelectionEnabled: boolean;
  email: ReturnType<typeof getEmail>;
  classificationFeedback: ClassificationFeedbackItem[] | null;
}) {
  const { aiChooseRule } = await import("./ai-choose-rule");

  await aiChooseRule({
    email,
    rules,
    emailAccount: getEmailAccount({ multiRuleSelectionEnabled }),
    logger: noopLogger,
    classificationFeedback,
  });
}

function capturedRequest(): { system: string; prompt: string } {
  const request = generateObjectSpy.mock.calls[0]?.[0];
  return { system: request?.system, prompt: request?.prompt };
}
