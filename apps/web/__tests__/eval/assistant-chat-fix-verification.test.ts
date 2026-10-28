import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatTrace,
  isAssistantWriteToolName,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  buildDefaultSystemRuleRows,
  configureRuleEvalPrisma,
  configureRuleEvalProvider,
  configureRuleMutationMocks,
} from "@/__tests__/eval/assistant-chat-rule-eval-test-utils";
import { judgeEvalOutput } from "@/__tests__/eval/semantic-judge";
import { getMockMessage } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";
import { messageContextSchema } from "@/utils/ai/assistant/chat-context-validation";
import { ExecutedRuleStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";

// pnpm --filter inbox-zero-ai test-ai eval/assistant-chat-fix-verification
const shouldRunEval = shouldRunEvalTests();
const logger = createScopedLogger("eval-assistant-chat-fix-verification");
const reporter = createEvalReporter({
  evalName: "assistant-chat-fix-verification",
});
const {
  mockCreateRule,
  mockPartialUpdateRule,
  mockUpdateRuleActions,
  mockSaveLearnedPatterns,
  mockCreateEmailProvider,
  mockRunRules,
  mockPosthogCaptureEvent,
  mockRedis,
} = vi.hoisted(() => ({
  mockCreateRule: vi.fn(),
  mockPartialUpdateRule: vi.fn(),
  mockUpdateRuleActions: vi.fn(),
  mockSaveLearnedPatterns: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
  mockRunRules: vi.fn(),
  mockPosthogCaptureEvent: vi.fn(),
  mockRedis: {
    set: vi.fn(),
    rpush: vi.fn(),
    hincrby: vi.fn(),
    expire: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    llen: vi.fn().mockResolvedValue(0),
    lrange: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/rule/rule")>();
  return {
    ...actual,
    createRule: mockCreateRule,
    partialUpdateRule: mockPartialUpdateRule,
    updateRuleActions: mockUpdateRuleActions,
  };
});

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: mockSaveLearnedPatterns,
}));

vi.mock("@/utils/ai/choose-rule/run-rules", () => ({
  runRules: mockRunRules,
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mockCreateEmailProvider,
}));

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: mockPosthogCaptureEvent,
  getPosthogLlmClient: () => null,
}));

vi.mock("@/utils/redis", () => ({
  redis: mockRedis,
}));

vi.mock("@/utils/prisma");

vi.mock("@/env", async () => {
  const { buildAssistantChatEvalEnv } = await vi.importActual<
    typeof import("@/__tests__/eval/assistant-chat-eval-env")
  >("@/__tests__/eval/assistant-chat-eval-env");

  return {
    env: buildAssistantChatEvalEnv(),
  };
});

const SENDER = "orders@procurement.example";

const scenarios = [
  {
    name: "reports a fix that the test confirms",
    learnedPatternBlocksFix: false,
  },
  {
    name: "does not claim a fix that a learned pattern still overrides",
    learnedPatternBlocksFix: true,
  },
];

describe.runIf(shouldRunEval)("Eval: assistant verifies rule fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureRuleMutationMocks({
      mockCreateRule,
      mockPartialUpdateRule,
      mockUpdateRuleActions,
      mockSaveLearnedPatterns,
    });
  });

  describeEvalMatrix("fix verification", (model, emailAccount) => {
    for (const scenario of scenarios) {
      test(scenario.name, async () => {
        const ruleRows = buildDefaultSystemRuleRows(
          new Date("2026-01-01T00:00:00Z"),
        );
        configureRuleEvalPrisma({ about: "", ruleRows });
        const findAccount =
          prisma.emailAccount.findUnique.getMockImplementation()!;
        prisma.emailAccount.findUnique.mockImplementation(async (args) => ({
          ...(await findAccount(args)),
          id: emailAccount.id,
          email: emailAccount.email,
          timezone: "UTC",
          knowledge: [],
          messagingChannels: [],
        }));

        const context = buildContext();
        configureRuleEvalProvider({ mockCreateEmailProvider, ruleRows });
        const provider = await mockCreateEmailProvider();
        provider.getMessage = vi.fn().mockResolvedValue(context.message);
        mockCreateEmailProvider.mockResolvedValue(provider);

        const testOutcomes: boolean[] = [];
        mockRunRules.mockImplementation(async () => {
          const ruleChanged =
            mockPartialUpdateRule.mock.calls.length > 0 ||
            mockUpdateRuleActions.mock.calls.length > 0 ||
            mockCreateRule.mock.calls.length > 0;
          const patternRemoved = mockSaveLearnedPatterns.mock.calls.length > 0;
          const fixed = scenario.learnedPatternBlocksFix
            ? patternRemoved
            : ruleChanged || patternRemoved;
          testOutcomes.push(fixed);
          return fixed ? noMatchResult() : receiptMatchResult(scenario);
        });

        const trace = await captureAssistantChatTrace({
          emailAccount,
          messages: [
            {
              role: "user",
              content:
                "This is a purchase order from one of our customers, not a receipt. It should stay in my inbox. Please fix this.",
            },
          ],
          context,
          logger,
        });

        const lastWriteIndex = trace.toolCalls.findLastIndex(
          (call) =>
            isAssistantWriteToolName(call.toolName) &&
            call.output !== undefined,
        );
        const testedAfterWrite =
          lastWriteIndex >= 0 &&
          trace.toolCalls
            .slice(lastWriteIndex + 1)
            .some(
              (call) =>
                call.toolName === "testRulesOnEmail" &&
                (call.input as { messageId?: string })?.messageId ===
                  context.message.id,
            );
        const latestTestFixed = testOutcomes.at(-1) ?? null;

        const judgment = await judgeEvalOutput({
          criterion: {
            name: "Fix outcome reported truthfully",
            description:
              "The assistant changes the user's rules so the selected email would no longer be sorted as a receipt, then reports the outcome consistently with the latest testRulesOnEmail result in the tool calls. It only says the email is now handled correctly if that latest test shows no Receipt match. If the latest test still shows Receipt, it tells the user the fix has not taken effect yet and explains or addresses the cause shown in the test, rather than claiming success.",
          },
          input: JSON.stringify({
            selectedEmail: context.message,
            latestTestFixed,
          }),
          output: JSON.stringify({
            response: trace.finalText,
            toolCalls: trace.toolCalls.filter(
              (call) => call.output !== undefined,
            ),
          }),
        });

        const pass = testedAfterWrite && judgment.pass;
        reporter.record({
          testName: scenario.name,
          model: model.label,
          pass,
          actual: JSON.stringify({
            testedAfterWrite,
            latestTestFixed,
            judgment,
            response: trace.finalText,
            toolCalls: trace.toolCalls.map((call) => call.toolName),
          }),
        });
        expect(pass).toBe(true);
      }, 240_000);
    }
  });

  afterAll(() => reporter.printReport());
});

function buildContext() {
  const message = getMockMessage({
    from: SENDER,
    to: "user@test.com",
    subject: "Purchase Order PO-1042",
    textPlain:
      "Please find attached purchase order PO-1042 for 40 units. Kindly confirm the delivery date.",
    textHtml: "",
  });

  return messageContextSchema.parse({
    type: "fix-rule",
    message: {
      id: message.id,
      threadId: message.threadId,
      snippet: message.snippet,
      textPlain: message.textPlain,
      textHtml: message.textHtml,
      headers: message.headers,
    },
    results: [
      {
        ruleName: "Receipt",
        systemType: "RECEIPT",
        reason:
          "This email contains an order with amounts, so it is a transaction record.",
      },
    ],
    expected: "none",
  });
}

function receiptMatchResult(scenario: { learnedPatternBlocksFix: boolean }) {
  return [
    {
      rule: { id: "receipt-rule-id", name: "Receipt", systemType: "RECEIPT" },
      actionItems: [{ id: "action-1", type: "LABEL", label: "Receipt" }],
      reason: scenario.learnedPatternBlocksFix
        ? `Matched learned pattern: "FROM: ${SENDER}"`
        : "This email documents an order, so it matches Receipt.",
      status: ExecutedRuleStatus.APPLIED,
      matchReasons: scenario.learnedPatternBlocksFix
        ? [
            {
              type: "LEARNED_PATTERN",
              group: { id: "receipt-group", name: "Receipt" },
              groupItem: {
                id: "receipt-item",
                type: "FROM",
                value: SENDER,
                exclude: false,
              },
            },
          ]
        : [{ type: "AI" }],
      createdAt: new Date(),
    },
  ];
}

function noMatchResult() {
  return [
    {
      rule: null,
      reason: "No rules matched",
      status: ExecutedRuleStatus.SKIPPED,
      createdAt: new Date(),
    },
  ];
}
