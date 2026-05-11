import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
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
import type { getEmailAccount } from "@/__tests__/helpers";
import { GroupItemType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/assistant-chat-rule-editing
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-rule-editing

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 120_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger(
  "eval-assistant-chat-rule-editing-learned-patterns",
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

const scenarios = [
  {
    title:
      "extends an existing category rule with learned patterns instead of creating a duplicate rule",
    reportName: "extend existing notification rule",
    prompt:
      "I already have a Notification rule. Add emails from @vendor-updates.example and @store-alerts.example to that rule so future emails from those senders get treated as notifications.",
    ruleName: "Notification",
    includes: ["@vendor-updates.example", "@store-alerts.example"],
  },
  {
    title:
      "uses learned pattern excludes when removing a recurring sender from an existing category rule",
    reportName: "exclude sender from existing notification rule",
    prompt:
      "I already have a Notification rule. Emails from support@tickets.example should stop matching that rule.",
    ruleName: "Notification",
    excludes: ["support@tickets.example"],
  },
] as const;

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
  "Eval: assistant chat rule editing learned patterns",
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
      "assistant-chat rule editing learned patterns",
      (model, emailAccount) => {
        for (const scenario of scenarios) {
          test(
            scenario.title,
            async () => {
              const { toolCalls, actual, didSaveLearnedPatterns } =
                await runAssistantChat({
                  emailAccount,
                  messages: [{ role: "user", content: scenario.prompt }],
                });

              const updateCall = getLastUpdateLearnedPatternsCall(toolCalls);
              const updateCallIndex = getLastToolCallIndex(
                toolCalls,
                "updateLearnedPatterns",
              );

              const pass =
                !!updateCall &&
                updateCall.ruleName === scenario.ruleName &&
                !toolCalls.some(
                  (toolCall) => toolCall.toolName === "createRule",
                ) &&
                !toolCalls.some(
                  (toolCall) => toolCall.toolName === "updateRuleConditions",
                ) &&
                hasRuleReadBeforeUpdate(toolCalls, updateCallIndex) &&
                (scenario.includes ?? []).every((expectedFrom) =>
                  hasIncludedFrom(updateCall.learnedPatterns, expectedFrom),
                ) &&
                (scenario.excludes ?? []).every((expectedFrom) =>
                  hasExcludedFrom(updateCall.learnedPatterns, expectedFrom),
                ) &&
                didSaveLearnedPatterns;

              evalReporter.record({
                testName: scenario.reportName,
                model: model.label,
                pass,
                actual,
              });
              expect(pass).toBe(true);
            },
            TIMEOUT,
          );
        }
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
  const saveLearnedPatternsCallsBefore =
    mockSaveLearnedPatterns.mock.calls.length;
  const toolCalls = await captureAssistantChatToolCalls({
    messages,
    emailAccount,
    logger,
  });
  const saveLearnedPatternsCallsAfter =
    mockSaveLearnedPatterns.mock.calls.length;

  return {
    toolCalls,
    actual: summarizeRecordedToolCalls(toolCalls, summarizeToolCall),
    didSaveLearnedPatterns:
      saveLearnedPatternsCallsAfter > saveLearnedPatternsCallsBefore,
  };
}

type UpdateLearnedPatternsInput = {
  ruleName: string;
  learnedPatterns: Array<{
    include?: {
      from?: string | null;
      subject?: string | null;
    } | null;
    exclude?: {
      from?: string | null;
      subject?: string | null;
    } | null;
  }>;
};

function getLastUpdateLearnedPatternsCall(toolCalls: RecordedToolCall[]) {
  const toolCall = [...toolCalls]
    .reverse()
    .find((candidate) => candidate.toolName === "updateLearnedPatterns");

  return isUpdateLearnedPatternsInput(toolCall?.input) ? toolCall.input : null;
}

function isUpdateLearnedPatternsInput(
  input: unknown,
): input is UpdateLearnedPatternsInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    ruleName?: unknown;
    learnedPatterns?: unknown;
  };

  return (
    typeof value.ruleName === "string" && Array.isArray(value.learnedPatterns)
  );
}

function hasIncludedFrom(
  learnedPatterns: UpdateLearnedPatternsInput["learnedPatterns"],
  expectedFrom: string,
) {
  return learnedPatterns.some(
    (pattern) => pattern.include?.from === expectedFrom,
  );
}

function hasExcludedFrom(
  learnedPatterns: UpdateLearnedPatternsInput["learnedPatterns"],
  expectedFrom: string,
) {
  return learnedPatterns.some(
    (pattern) => pattern.exclude?.from === expectedFrom,
  );
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (isUpdateLearnedPatternsInput(toolCall.input)) {
    return `${toolCall.toolName}(ruleName=${toolCall.input.ruleName}, patterns=${toolCall.input.learnedPatterns.length})`;
  }

  return toolCall.toolName;
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
