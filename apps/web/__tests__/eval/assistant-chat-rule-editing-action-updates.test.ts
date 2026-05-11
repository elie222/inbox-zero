import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  getLastRuleActionsUpdate,
  hasActionType,
  hasLabelAction,
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
import { ActionType, GroupItemType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/assistant-chat-rule-editing
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-rule-editing

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 240_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger(
  "eval-assistant-chat-rule-editing-action-updates",
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
  "Eval: assistant chat rule editing action updates",
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
      "assistant-chat rule editing action updates",
      (model, emailAccount) => {
        test(
          "updates existing rule actions after reading the rules",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "Change my Notification rule so those emails are marked read too.",
                },
              ],
            });

            const updateCall = getLastRuleActionsUpdate(toolCalls);

            const pass =
              !!updateCall &&
              updateCall.ruleName === "Notification" &&
              hasRuleReadBeforeUpdate(toolCalls, updateCall.index) &&
              !toolCalls.some(
                (toolCall) => toolCall.toolName === "createRule",
              ) &&
              hasActionType(updateCall.actions, ActionType.MARK_READ) &&
              hasLabelAction(updateCall.actions, "Notification");

            evalReporter.record({
              testName: "update existing rule actions",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "does not add delay when updating rule actions unless requested",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: "Add a draft reply action to my Notification rule.",
                },
              ],
            });

            const updateCall = getLastRuleActionsUpdate(toolCalls);

            const pass =
              !!updateCall &&
              updateCall.ruleName === "Notification" &&
              hasActionType(updateCall.actions, ActionType.DRAFT_EMAIL) &&
              updateCall.actions.every((a) => a.delayInMinutes == null);

            evalReporter.record({
              testName: "no unrequested delay on action update",
              model: model.label,
              pass,
              actual,
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
    actual: summarizeRecordedToolCalls(
      toolCalls,
      (toolCall) => toolCall.toolName,
    ),
  };
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
