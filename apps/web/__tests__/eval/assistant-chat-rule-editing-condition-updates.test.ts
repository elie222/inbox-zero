import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  getLastMatchingToolCall,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import type { getEmailAccount } from "@/__tests__/helpers";
import {
  ActionType,
  GroupItemType,
  LogicalOperator,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  getDefaultActions,
  getRuleConfig,
  SYSTEM_RULE_ORDER,
} from "@/utils/rule/consts";

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
const defaultRuleRows = getDefaultRuleRows();
const defaultRuleRowsByName = new Map(
  defaultRuleRows.map((rule) => [rule.name, rule]),
);

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

vi.mock("@/utils/rule/rule", () => ({
  createRule: mockCreateRule,
  partialUpdateRule: mockPartialUpdateRule,
  updateRuleActions: mockUpdateRuleActions,
}));

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

      mockCreateRule.mockResolvedValue({ id: "created-rule-id" });
      mockPartialUpdateRule.mockResolvedValue({ id: "updated-rule-id" });
      mockUpdateRuleActions.mockResolvedValue({ id: "updated-rule-id" });
      mockSaveLearnedPatterns.mockResolvedValue({ success: true });

      prisma.emailAccount.findUnique.mockImplementation(async ({ select }) => {
        if (select?.rules) {
          return {
            about: "My name is Test User, and I manage a company inbox.",
            rules: defaultRuleRows,
          };
        }

        return {
          about: "My name is Test User, and I manage a company inbox.",
        };
      });

      prisma.emailAccount.update.mockResolvedValue({
        about: "My name is Test User, and I manage a company inbox.",
      });

      prisma.rule.findUnique.mockImplementation(async ({ where, select }) => {
        const ruleName = where?.name_emailAccountId?.name;
        if (ruleName === "Notification" && select?.group) {
          return {
            group: {
              items: [
                {
                  type: GroupItemType.FROM,
                  value: "alerts@system.example",
                  exclude: false,
                },
              ],
            },
          };
        }

        return ruleName ? (defaultRuleRowsByName.get(ruleName) ?? null) : null;
      });

      mockCreateEmailProvider.mockResolvedValue({
        getMessagesWithPagination: vi.fn().mockResolvedValue({
          messages: [],
          nextPageToken: undefined,
        }),
        getLabels: vi.fn().mockResolvedValue(getDefaultLabels()),
        archiveThreadWithLabel: vi.fn(),
        markReadThread: vi.fn(),
        bulkArchiveFromSenders: vi.fn(),
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

            const updateCall = getLastMatchingToolCall(
              toolCalls,
              "updateRuleConditions",
              isUpdateRuleConditionsInput,
            )?.input;
            const updateCallIndex = getLastToolCallIndex(
              toolCalls,
              "updateRuleConditions",
            );

            const pass =
              !!updateCall &&
              updateCall.ruleName === "To Reply" &&
              hasRuleReadBeforeUpdate(toolCalls, updateCallIndex) &&
              !toolCalls.some(
                (toolCall) => toolCall.toolName === "createRule",
              ) &&
              !toolCalls.some(
                (toolCall) => toolCall.toolName === "updateLearnedPatterns",
              ) &&
              mentionsCcExclusion(updateCall.condition.aiInstructions);

            evalReporter.record({
              testName: "update To Reply rule for cc handling",
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
    actual: summarizeRecordedToolCalls(toolCalls, summarizeToolCall),
  };
}

type UpdateRuleConditionsInput = {
  ruleName: string;
  condition: {
    aiInstructions?: string | null;
  };
};

function isUpdateRuleConditionsInput(
  input: unknown,
): input is UpdateRuleConditionsInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    ruleName?: unknown;
    condition?: unknown;
  };

  return (
    typeof value.ruleName === "string" &&
    !!value.condition &&
    typeof value.condition === "object"
  );
}

function mentionsCcExclusion(text: string | null | undefined) {
  if (!text) return false;

  const normalizedText = text.toLowerCase();

  return (
    /(?:\bcc\b|carbon copy|copied|copy recipient|primary recipient|to field)/.test(
      normalizedText,
    ) &&
    /\b(?:not|don't|do not|doesn't|does not|no|exclude|excluding)\b/.test(
      normalizedText,
    )
  );
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

function getDefaultRuleRows() {
  return SYSTEM_RULE_ORDER.map((systemType) => {
    const config = getRuleConfig(systemType);

    return {
      id: `${systemType.toLowerCase()}-rule-id`,
      name: config.name,
      instructions: config.instructions,
      updatedAt: notificationRuleUpdatedAt,
      from: null,
      to: null,
      subject: null,
      conditionalOperator: LogicalOperator.AND,
      enabled: true,
      runOnThreads: config.runOnThreads,
      systemType,
      actions: getDefaultActions(systemType, "google").map((action) => ({
        type: action.type,
        content: action.content,
        label: action.label,
        to: action.to,
        cc: action.cc,
        bcc: action.bcc,
        subject: action.subject,
        url: action.url,
        folderName: action.folderName,
      })),
    };
  });
}

function getDefaultLabels() {
  return defaultRuleRows.flatMap((rule) =>
    rule.actions
      .filter((action) => action.type === ActionType.LABEL && action.label)
      .map((action) => ({
        id: `Label_${action.label}`,
        name: action.label!,
      })),
  );
}
