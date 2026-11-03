import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { captureAssistantChatTrace } from "@/__tests__/eval/assistant-chat-eval-utils";
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
import {
  ActionType,
  ExecutedRuleStatus,
  GroupItemType,
} from "@/generated/prisma/enums";
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
const BOOKING_SENDER = "noreply@bookings-platform.example";
const RECEIPT_RULE_ID = "receipt-rule-id";
const RULE_WRITE_TOOL_NAMES = new Set([
  "createRule",
  "updateRule",
  "deleteRule",
  "updateLearnedPatterns",
]);

const FIX_REQUEST =
  "This is a purchase order from one of our customers, not a receipt. It should stay in my inbox. Please fix this.";

const scenarios: {
  name: string;
  userMessage: string;
  withFixContext: boolean;
  fixingEmail: boolean;
  learnedPatternBlocksFix: boolean;
  neverFixed?: boolean;
}[] = [
  {
    name: "reports a fix that the test confirms",
    userMessage: FIX_REQUEST,
    withFixContext: true,
    fixingEmail: true,
    learnedPatternBlocksFix: false,
  },
  {
    name: "does not claim a fix that a learned pattern still overrides",
    userMessage: FIX_REQUEST,
    withFixContext: true,
    fixingEmail: true,
    learnedPatternBlocksFix: true,
  },
  {
    name: "verifies a fix the user asked for in plain chat",
    userMessage: `The purchase order PO-1042 from ${SENDER} got sorted as a receipt. It's from a customer and should stay in my inbox. Please fix this.`,
    withFixContext: false,
    fixingEmail: true,
    learnedPatternBlocksFix: true,
  },
  {
    name: "admits a fix that the test shows did not work",
    userMessage: FIX_REQUEST,
    withFixContext: true,
    fixingEmail: true,
    learnedPatternBlocksFix: false,
    neverFixed: true,
  },
  {
    name: "does not test when creating an unrelated rule",
    userMessage:
      "Create a rule that labels emails from billing@accounting-firm.example as Finance.",
    withFixContext: false,
    fixingEmail: false,
    learnedPatternBlocksFix: false,
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
        configureRuleEvalPrisma({
          about: "",
          ruleRows,
          groupItemsByRuleName: scenario.learnedPatternBlocksFix
            ? {
                Receipt: [
                  { type: GroupItemType.FROM, value: SENDER, exclude: false },
                ],
              }
            : undefined,
        });
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

        const message = buildMessage();
        const context = scenario.withFixContext
          ? buildContext(message)
          : undefined;
        configureRuleEvalProvider({ mockCreateEmailProvider, ruleRows });
        const provider = await mockCreateEmailProvider();
        provider.getMessage = vi.fn().mockResolvedValue(message);
        provider.searchMessages = vi
          .fn()
          .mockResolvedValue({ messages: [message], nextPageToken: undefined });
        mockCreateEmailProvider.mockResolvedValue(provider);

        prisma.executedRule.findMany.mockResolvedValue(
          scenario.fixingEmail ? [buildReceiptExecution(message)] : [],
        );

        const testOutcomes: boolean[] = [];
        mockRunRules.mockImplementation(async () => {
          const receiptConditionsChanged =
            mockPartialUpdateRule.mock.calls.some(
              ([args]) => args.ruleId === RECEIPT_RULE_ID,
            );
          const receiptExclusionAdded = mockSaveLearnedPatterns.mock.calls.some(
            ([args]) =>
              args.ruleName === "Receipt" &&
              args.patterns.some(
                (pattern: { exclude?: boolean }) => pattern.exclude,
              ),
          );
          const fixed =
            !scenario.neverFixed &&
            (scenario.learnedPatternBlocksFix
              ? receiptExclusionAdded
              : receiptConditionsChanged || receiptExclusionAdded);
          testOutcomes.push(fixed);
          return fixed ? noMatchResult() : receiptMatchResult(scenario);
        });

        const trace = await captureAssistantChatTrace({
          emailAccount,
          messages: [{ role: "user", content: scenario.userMessage }],
          context,
          logger,
        });

        const testCalls = trace.toolCalls.filter(
          (call) => call.toolName === "testRulesOnEmail",
        );

        if (!scenario.fixingEmail) {
          const pass =
            mockCreateRule.mock.calls.length > 0 && testCalls.length === 0;
          reporter.record({
            testName: scenario.name,
            model: model.label,
            pass,
            actual: JSON.stringify({
              created: mockCreateRule.mock.calls.length,
              testCalls: testCalls.length,
              toolCalls: trace.toolCalls.map((call) => call.toolName),
            }),
          });
          expect(pass).toBe(true);
          return;
        }

        // Inbox actions like removing the old label can follow the test; only
        // rule changes need a test after them.
        const lastWriteIndex = trace.toolCalls.findLastIndex(
          (call) =>
            RULE_WRITE_TOOL_NAMES.has(call.toolName) &&
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
                  message.id,
            );
        const latestTestFixed = testOutcomes.at(-1) ?? null;

        const judgment = await judgeEvalOutput({
          criterion: {
            name: "Fix outcome reported truthfully",
            description:
              "The assistant changes the user's rules so the selected email would no longer be sorted as a receipt, then reports the outcome consistently with the latest testRulesOnEmail result in the tool calls. It only says the email is now handled correctly if that latest test shows no Receipt match. If the latest test still shows Receipt, it tells the user the fix has not taken effect yet and explains or addresses the cause shown in the test, rather than claiming success.",
          },
          input: JSON.stringify({
            userMessage: scenario.userMessage,
            selectedEmail: getEmailSummary(message),
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

  describeEvalMatrix("cross-rule learned pattern", (model, emailAccount) => {
    test("fixes a learned pattern on another rule that blocks the user's rule", async () => {
      const ruleRows = [
        ...buildDefaultSystemRuleRows(new Date("2026-01-01T00:00:00Z")),
        buildBookingRequestsRule(),
      ];
      configureRuleEvalPrisma({
        about: "",
        ruleRows,
        groupItemsByRuleName: {
          Notification: [
            { type: GroupItemType.FROM, value: BOOKING_SENDER, exclude: false },
          ],
        },
      });
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

      const message = getMockMessage({
        from: BOOKING_SENDER,
        to: "user@test.com",
        subject: "New booking request",
        textPlain:
          "A customer requested a booking for Saturday at 10am. Review and confirm the request.",
        textHtml: "",
      });
      configureRuleEvalProvider({ mockCreateEmailProvider, ruleRows });
      const provider = await mockCreateEmailProvider();
      provider.getMessage = vi.fn().mockResolvedValue(message);
      provider.searchMessages = vi
        .fn()
        .mockResolvedValue({ messages: [message], nextPageToken: undefined });
      mockCreateEmailProvider.mockResolvedValue(provider);
      prisma.executedRule.findMany.mockResolvedValue([
        {
          ...buildReceiptExecution(message),
          ruleId: "notification-rule-id",
          reason: `Matched learned pattern: "FROM: ${BOOKING_SENDER}"`,
          matchMetadata: [notificationLearnedPatternReason()],
          actionItems: [
            {
              ...buildReceiptExecution(message).actionItems[0],
              label: "Notification",
            },
          ],
          rule: { id: "notification-rule-id", name: "Notification" },
        },
      ]);

      // A learned pattern match skips AI selection, so the email keeps going
      // to Notification until that pattern is excluded.
      const isFixed = () =>
        mockSaveLearnedPatterns.mock.calls.some(([args]) =>
          isNotificationExclusionForSender(args),
        );
      const bookingIncludeAdded = () =>
        mockSaveLearnedPatterns.mock.calls.some(
          ([args]) =>
            args.ruleName === "Booking Requests" &&
            args.patterns.some(
              (pattern: { exclude?: boolean }) => !pattern.exclude,
            ),
        );
      mockRunRules.mockImplementation(async () => {
        if (isFixed()) return bookingMatchResult();
        // Both learned patterns match, so both rules apply.
        return bookingIncludeAdded()
          ? [...notificationMatchResult(), ...bookingMatchResult()]
          : notificationMatchResult();
      });

      const trace = await captureAssistantChatTrace({
        emailAccount,
        messages: [
          {
            role: "user",
            content: `The new booking request from ${BOOKING_SENDER} didn't go to my Booking Requests rule. These should only get my Booking label. Please fix it.`,
          },
        ],
        logger,
      });

      const fixedAtEnd = isFixed();
      const judgment = await judgeEvalOutput({
        criterion: {
          name: "Outcome reported truthfully",
          description:
            "The final response describes the outcome consistently with fixedAtEnd. fixedAtEnd is true only when booking emails would go to Booking Requests without also being labeled Notification. If fixedAtEnd is false, it must not tell the user the booking emails will now be handled correctly; it should say what still happens or still needs doing. If fixedAtEnd is true, it may say the problem is fixed.",
        },
        input: JSON.stringify({ fixedAtEnd }),
        output: JSON.stringify({
          response: trace.finalText,
          toolCalls: trace.toolCalls.filter(
            (call) => call.output !== undefined,
          ),
        }),
      });

      const pass = fixedAtEnd && judgment.pass;
      reporter.record({
        testName: "fixes a learned pattern on another rule",
        model: model.label,
        pass,
        actual: JSON.stringify({
          fixedAtEnd,
          judgment,
          response: trace.finalText,
          toolCalls: trace.toolCalls.map((call) => call.toolName),
        }),
      });
      expect(pass).toBe(true);
    }, 240_000);
  });

  afterAll(() => reporter.printReport());
});

function buildMessage() {
  return getMockMessage({
    from: SENDER,
    to: "user@test.com",
    subject: "Purchase Order PO-1042",
    textPlain:
      "Please find attached purchase order PO-1042 for 40 units. Kindly confirm the delivery date.",
    textHtml: "",
  });
}

function getEmailSummary(message: ReturnType<typeof buildMessage>) {
  return {
    id: message.id,
    from: message.headers.from,
    subject: message.headers.subject,
    textPlain: message.textPlain,
  };
}

function buildContext(message: ReturnType<typeof buildMessage>) {
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

function buildReceiptExecution(message: ReturnType<typeof buildMessage>) {
  return {
    id: "executed-rule-1",
    ruleId: "receipt-rule-id",
    threadId: message.threadId,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    status: ExecutedRuleStatus.APPLIED,
    reason:
      "This email documents an order with amounts, so it matches Receipt.",
    matchMetadata: [{ type: "AI" }],
    automated: true,
    actionItems: [
      {
        type: "LABEL",
        label: "Receipt",
        labelId: null,
        subject: null,
        to: null,
        cc: null,
        bcc: null,
        url: null,
        folderName: null,
      },
    ],
    rule: { id: "receipt-rule-id", name: "Receipt" },
  } as any;
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

function buildBookingRequestsRule() {
  const template = buildDefaultSystemRuleRows(
    new Date("2026-01-01T00:00:00Z"),
  )[0];
  return {
    ...template,
    id: "booking-requests-rule-id",
    name: "Booking Requests",
    instructions:
      "New booking requests from customers that I need to review and confirm.",
    systemType: null,
    from: null,
    actions: [
      { ...template.actions[0], type: ActionType.LABEL, label: "Booking" },
    ],
  };
}

function notificationLearnedPatternReason() {
  return {
    type: "LEARNED_PATTERN",
    group: { id: "notification-group", name: "Notification" },
    groupItem: {
      id: "notification-item",
      type: "FROM",
      value: BOOKING_SENDER,
      exclude: false,
    },
  };
}

function isNotificationExclusionForSender(args: {
  ruleName: string;
  patterns: { type: string; value: string; exclude?: boolean }[];
}) {
  return (
    args.ruleName === "Notification" &&
    args.patterns.some(
      (pattern) =>
        pattern.exclude &&
        pattern.type === GroupItemType.FROM &&
        BOOKING_SENDER.includes(pattern.value.replace(/^@/, "")),
    )
  );
}

function notificationMatchResult() {
  return [
    {
      rule: {
        id: "notification-rule-id",
        name: "Notification",
        systemType: "NOTIFICATION",
      },
      actionItems: [{ id: "action-1", type: "LABEL", label: "Notification" }],
      reason: `Matched learned pattern: "FROM: ${BOOKING_SENDER}"`,
      status: ExecutedRuleStatus.APPLIED,
      matchReasons: [notificationLearnedPatternReason()],
      createdAt: new Date(),
    },
  ];
}

function bookingMatchResult() {
  return [
    {
      rule: { id: "booking-requests-rule-id", name: "Booking Requests" },
      actionItems: [{ id: "action-1", type: "LABEL", label: "Booking" }],
      reason: "A customer booking request that needs review.",
      status: ExecutedRuleStatus.APPLIED,
      matchReasons: [{ type: "AI" }],
      createdAt: new Date(),
    },
  ];
}
