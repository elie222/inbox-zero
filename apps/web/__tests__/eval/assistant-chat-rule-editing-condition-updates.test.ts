import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  getLastRuleConditionUpdate,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
  isUpdateRuleConditionsInput,
  isUpdateRuleInput,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import {
  buildDefaultSystemRuleRows,
  configureRuleEvalPrisma,
  configureRuleEvalProvider,
  configureRuleMutationMocks,
} from "@/__tests__/eval/assistant-chat-rule-eval-test-utils";
import type { getEmailAccount } from "@/__tests__/helpers";
import { GroupItemType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/assistant-chat-rule-editing
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-rule-editing

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger(
  "eval-assistant-chat-rule-editing-condition-updates",
);
const notificationRuleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const defaultRuleRows = buildDefaultSystemRuleRows(notificationRuleUpdatedAt);
const about = "My name is Test User, and I manage a company inbox.";
const notificationGroupItems = [
  {
    type: GroupItemType.FROM,
    value: "alerts@system.example",
    exclude: false,
  },
];

const {
  mockCreateRule,
  mockPartialUpdateRule,
  mockUpdateRuleActions,
  mockSaveLearnedPatterns,
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockUnsubscribeSenderAndMark,
} = vi.hoisted(() => ({
  mockCreateRule: vi.fn(),
  mockPartialUpdateRule: vi.fn(),
  mockUpdateRuleActions: vi.fn(),
  mockSaveLearnedPatterns: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
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
  mockUnsubscribeSenderAndMark: vi.fn(),
}));

vi.mock("@/utils/rule/rule", async (importOriginal) => {
  const { buildRuleModuleMutationMock } = await import(
    "@/__tests__/eval/assistant-chat-rule-eval-test-utils"
  );

  return buildRuleModuleMutationMock({
    importOriginal: () => importOriginal<typeof import("@/utils/rule/rule")>(),
    mockCreateRule,
    mockPartialUpdateRule,
    mockUpdateRuleActions,
  });
});

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: mockSaveLearnedPatterns,
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

vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: mockUnsubscribeSenderAndMark,
}));

vi.mock("@/utils/prisma");

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

describe.runIf(shouldRunEval)(
  "Eval: assistant chat rule editing condition updates",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      configureRuleMutationMocks({
        mockCreateRule,
        mockPartialUpdateRule,
        mockUpdateRuleActions,
        mockSaveLearnedPatterns,
      });

      configureRuleEvalPrisma({
        about,
        ruleRows: defaultRuleRows,
        groupItemsByRuleName: {
          Notification: notificationGroupItems,
        },
      });

      configureRuleEvalProvider({
        mockCreateEmailProvider,
        ruleRows: defaultRuleRows,
      });
    });

    describeEvalMatrix(
      "assistant-chat rule editing condition updates",
      (model, emailAccount) => {
        test(
          'updates the "To Reply" rule instead of creating a new rule for CC handling',
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "If I am CC'd on an email, it should not be marked To Reply.",
                },
              ],
            });

            const updateCall = getLastRuleConditionUpdate(toolCalls);
            const judgeResult = updateCall
              ? await judgeEvalOutput({
                  input:
                    "If I am CC'd on an email, it should not be marked To Reply.",
                  output: updateCall.condition.aiInstructions ?? "",
                  expected:
                    "Rule instructions that exclude emails where the user is only CC'd from the To Reply rule.",
                  criterion: {
                    name: "CC exclusion semantics",
                    description:
                      "The generated aiInstructions should semantically express that emails where the user is only CC'd should not match the To Reply rule. Exact CC or negation wording is not required.",
                  },
                })
              : null;

            const pass =
              !!updateCall &&
              !!judgeResult?.pass &&
              updateCall.ruleName === "To Reply" &&
              hasRuleReadBeforeUpdate(toolCalls, updateCall.index) &&
              !toolCalls.some(
                (toolCall) => toolCall.toolName === "createRule",
              ) &&
              !toolCalls.some(
                (toolCall) => toolCall.toolName === "updateLearnedPatterns",
              );

            evalReporter.record({
              testName: "update To Reply rule for cc handling",
              model: model.label,
              pass,
              actual: updateCall
                ? `${actual} | ${formatSemanticJudgeActual(
                    updateCall.condition.aiInstructions ?? "",
                    judgeResult!,
                  )}`
                : actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );
      },
    );

    afterAll(() => {
      evalReporter.printReport();
    });
  },
);

async function runAssistantChat({
  emailAccount,
  messages,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
}) {
  const toolCalls = await captureAssistantChatToolCalls({
    messages,
    emailAccount,
    logger,
  });

  return {
    toolCalls,
    actual: summarizeRecordedToolCalls(toolCalls, summarizeToolCall),
  };
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (isUpdateRuleConditionsInput(toolCall.input)) {
    return (
      toolCall.toolName +
      "(ruleName=" +
      toolCall.input.ruleName +
      ", aiInstructions=" +
      truncate(toolCall.input.condition.aiInstructions) +
      ")"
    );
  }

  if (isUpdateRuleInput(toolCall.input)) {
    return (
      toolCall.toolName +
      "(ruleName=" +
      toolCall.input.ruleName +
      ", aiInstructions=" +
      truncate(toolCall.input.updates.condition?.aiInstructions) +
      ")"
    );
  }

  return toolCall.toolName;
}

function truncate(value: string | null | undefined, maxLength = 120) {
  if (!value) return "null";
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function getLastToolCallIndex(toolCalls: RecordedToolCall[], toolName: string) {
  return toolCalls.findLastIndex((toolCall) => toolCall.toolName === toolName);
}

function hasRuleReadBeforeUpdate(
  toolCalls: RecordedToolCall[],
  updateCallIndex: number,
) {
  if (updateCallIndex < 0) return false;

  return (
    getLastToolCallIndex(
      toolCalls.slice(0, updateCallIndex),
      "getUserRulesAndSettings",
    ) >= 0
  );
}
