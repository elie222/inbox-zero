import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import type { getEmailAccount } from "@/__tests__/helpers";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  getDefaultActions,
  getRuleConfig,
  SYSTEM_RULE_ORDER,
} from "@/utils/rule/consts";

// pnpm test-ai eval/assistant-chat-static-sender-rules
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-static-sender-rules

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 150_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger(
  "eval-assistant-chat-static-sender-rules-learned-patterns",
);
const ruleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const defaultRuleRows = getDefaultRuleRows();

const scenarios = [
  {
    title:
      "uses learned patterns when adding a recurring sender to the Newsletter rule",
    reportName: "newsletter learned pattern update (current)",
    prompt:
      "i already have newsletters. digest@briefing.example should be treated like the rest of those, not its own thing.",
    ruleName: "Newsletter",
    includes: ["digest@briefing.example"],
  },
  {
    title:
      "uses learned patterns when the user refers to an existing category indirectly",
    reportName: "newsletter indirect category include (current)",
    prompt:
      "i already have newsletters sorted. @weekday-brief.example should go there too.",
    ruleName: "Newsletter",
    includes: ["@weekday-brief.example"],
  },
  {
    title:
      "uses learned patterns for multiple senders added to the Newsletter rule",
    reportName: "newsletter multi-sender include (current)",
    prompt:
      "also, @weekday-brief.example and @industry-roundup.example should go with my newsletters.",
    ruleName: "Newsletter",
    includes: ["@weekday-brief.example", "@industry-roundup.example"],
  },
  {
    title: "uses learned patterns for another existing system category",
    reportName: "receipt learned pattern include (current)",
    prompt:
      "billing@vendor-invoices.example should go with my receipts, not be its own thing.",
    ruleName: "Receipt",
    includes: ["billing@vendor-invoices.example"],
  },
  {
    title:
      "uses learned pattern excludes when the user says a sender should stay out of an existing category",
    reportName: "newsletter learned pattern exclude (current)",
    prompt:
      "i don't want team@project-digest.example in Newsletter. keep it out of that bucket.",
    ruleName: "Newsletter",
    excludes: ["team@project-digest.example"],
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
  "Eval: assistant chat static sender rules learned patterns",
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
            about: "I manage a busy work inbox.",
            rules: defaultRuleRows,
          };
        }

        return {
          about: "I manage a busy work inbox.",
        };
      });

      prisma.emailAccount.update.mockResolvedValue({
        about: "I manage a busy work inbox.",
      });

      prisma.rule.findUnique.mockImplementation(async ({ where, select }) => {
        const ruleName = where?.name_emailAccountId?.name;
        const matchedRule = defaultRuleRows.find(
          (rule) => rule.name === ruleName,
        );

        if (!matchedRule) return null;

        if (select?.group) {
          return {
            group: {
              items: [],
            },
          };
        }

        return {
          id: matchedRule.id,
          name: matchedRule.name,
          updatedAt: matchedRule.updatedAt,
        };
      });

      mockCreateEmailProvider.mockResolvedValue({
        getMessagesWithPagination: vi.fn().mockResolvedValue({
          messages: [],
          nextPageToken: undefined,
        }),
        getLabels: vi.fn().mockResolvedValue(getDefaultLabels()),
        createLabel: vi.fn(async (name: string) => ({
          id: `label-${name.toLowerCase().replace(/\s+/g, "-")}`,
          name,
          type: "user",
        })),
        archiveThreadWithLabel: vi.fn(),
        markReadThread: vi.fn(),
        bulkArchiveFromSenders: vi.fn(),
      });
    });

    describeEvalMatrix(
      "assistant-chat static sender rules learned patterns",
      (model, emailAccount) => {
        for (const scenario of scenarios) {
          test(
            scenario.title,
            async () => {
              const result = await runAssistantChat({
                emailAccount,
                messages: [{ role: "user", content: scenario.prompt }],
              });

              const updateCall = findMatchingLearnedPatternsUpdate(
                result.toolCalls,
                {
                  ruleName: scenario.ruleName,
                  includes: scenario.includes,
                  excludes: scenario.excludes,
                },
              );

              const pass =
                !!updateCall &&
                !result.toolCalls.some(
                  (toolCall) => toolCall.toolName === "createRule",
                ) &&
                result.didSaveLearnedPatterns;

              evalReporter.record({
                testName: scenario.reportName,
                model: model.label,
                pass,
                actual: result.actual,
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

type AssistantChatEvalResult = {
  actual: string;
  toolCalls: RecordedToolCall[];
  didSaveLearnedPatterns: boolean;
};

async function runAssistantChat({
  emailAccount,
  messages,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
}): Promise<AssistantChatEvalResult> {
  const saveLearnedPatternsCallsBefore =
    mockSaveLearnedPatterns.mock.calls.length;
  const toolCalls = await captureAssistantChatToolCalls({
    messages,
    emailAccount,
    logger,
  });
  const saveLearnedPatternsCallsAfter =
    mockSaveLearnedPatterns.mock.calls.length;
  const learnedPatternsCall = findUpdateLearnedPatternsCall(
    toolCalls,
    () => true,
  );

  return {
    toolCalls,
    actual: learnedPatternsCall
      ? summarizeUpdateLearnedPatternsCall(learnedPatternsCall)
      : summarizeToolCalls(toolCalls),
    didSaveLearnedPatterns:
      saveLearnedPatternsCallsAfter > saveLearnedPatternsCallsBefore,
  };
}

function findUpdateLearnedPatternsCall(
  toolCalls: RecordedToolCall[],
  matches: (input: UpdateLearnedPatternsInput) => boolean,
) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== "updateLearnedPatterns") continue;
    if (!isUpdateLearnedPatternsInput(toolCall.input)) continue;
    if (!matches(toolCall.input)) continue;

    return toolCall.input;
  }

  return null;
}

function findMatchingLearnedPatternsUpdate(
  toolCalls: RecordedToolCall[],
  {
    ruleName,
    includes = [],
    excludes = [],
  }: {
    ruleName: string;
    includes?: string[];
    excludes?: string[];
  },
) {
  return findUpdateLearnedPatternsCall(
    toolCalls,
    (input) =>
      input.ruleName === ruleName &&
      includes.every((expectedFrom) =>
        hasIncludedFrom(input.learnedPatterns, expectedFrom),
      ) &&
      excludes.every((expectedFrom) =>
        hasExcludedFrom(input.learnedPatterns, expectedFrom),
      ),
  );
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

function summarizeToolCalls(toolCalls: RecordedToolCall[]) {
  if (toolCalls.length === 0) return "no tool calls";
  return toolCalls.map((toolCall) => toolCall.toolName).join(" | ");
}

function summarizeUpdateLearnedPatternsCall(
  updateCall: UpdateLearnedPatternsInput,
) {
  const fromValues = updateCall.learnedPatterns
    .flatMap((pattern) => [
      pattern.include?.from ?? null,
      pattern.exclude?.from ?? null,
    ])
    .filter((value): value is string => Boolean(value));

  return `updateLearnedPatterns(rule=${updateCall.ruleName}; patterns=${updateCall.learnedPatterns.length}; from=${fromValues.join("|") || "none"})`;
}

function hasIncludedFrom(
  learnedPatterns: UpdateLearnedPatternsInput["learnedPatterns"],
  expectedFrom: string,
) {
  return learnedPatterns.some(
    (pattern) =>
      !!pattern.include?.from &&
      senderMatches(pattern.include.from, expectedFrom),
  );
}

function hasExcludedFrom(
  learnedPatterns: UpdateLearnedPatternsInput["learnedPatterns"],
  expectedFrom: string,
) {
  return learnedPatterns.some(
    (pattern) =>
      !!pattern.exclude?.from &&
      senderMatches(pattern.exclude.from, expectedFrom),
  );
}

function senderMatches(actual: string, expected: string) {
  return splitSenderValues(actual).includes(normalizeSender(expected));
}

function normalizeSender(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

function splitSenderValues(value: string) {
  return value
    .split(/[|,\n]/)
    .map((part) => normalizeSender(part))
    .filter(Boolean);
}

function getDefaultRuleRows() {
  return SYSTEM_RULE_ORDER.map((systemType) => {
    const config = getRuleConfig(systemType);

    return {
      id: `${systemType.toLowerCase()}-rule-id`,
      name: config.name,
      instructions: config.instructions,
      updatedAt: ruleUpdatedAt,
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
