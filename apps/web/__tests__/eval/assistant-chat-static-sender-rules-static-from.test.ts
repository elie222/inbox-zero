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
  "eval-assistant-chat-static-sender-rules-static-from",
);
const ruleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const defaultRuleRows = getDefaultRuleRows();

const scenarios = [
  {
    title: "uses static.from for an exact sender domain",
    reportName: "single sender domain (current)",
    prompt:
      "can you catch everything from @briefing.example and label it Briefings? leave it in the inbox.",
    senders: ["@briefing.example"],
  },
  {
    title: "uses static.from for a small explicit sender list",
    reportName: "sender list (current)",
    prompt:
      "create a new rule that catches emails from @lodging.example, @flight-alerts.example, and @rail.example. label them Reservations and don't archive them.",
    senders: ["@lodging.example", "@flight-alerts.example", "@rail.example"],
  },
  {
    title:
      "uses static.from for a single explicit sender in more conversational wording",
    reportName: "single sender address phrasing (current)",
    prompt:
      "anything from dispatch@itinerary.example should land in Travel Plans.",
    senders: ["dispatch@itinerary.example"],
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
  "Eval: assistant chat static sender rules static.from",
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
      "assistant-chat static sender rules static.from",
      (model, emailAccount) => {
        for (const scenario of scenarios) {
          test(
            scenario.title,
            async () => {
              const result = await runAssistantChat({
                emailAccount,
                messages: [{ role: "user", content: scenario.prompt }],
              });

              const pass = usesStaticFromOnlyForSenders(
                result.createCall,
                scenario.senders,
              );

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

type CreateRuleInput = {
  name: string;
  condition: {
    aiInstructions?: string | null;
    static?: {
      from?: string | null;
      to?: string | null;
      subject?: string | null;
    } | null;
  };
  actions: Array<{
    type: ActionType;
    fields?: {
      label?: string | null;
    } | null;
  }>;
};

type AssistantChatEvalResult = {
  createCall: CreateRuleInput | null;
  actual: string;
};

async function runAssistantChat({
  emailAccount,
  messages,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
}): Promise<AssistantChatEvalResult> {
  const toolCalls = await captureAssistantChatToolCalls({
    messages,
    emailAccount,
    logger,
  });
  const createCall = getLastCreateRuleCall(toolCalls);

  return {
    createCall,
    actual: createCall
      ? summarizeCreateRuleCall(createCall)
      : summarizeToolCalls(toolCalls),
  };
}

function getLastCreateRuleCall(toolCalls: RecordedToolCall[]) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== "createRule") continue;
    if (!isCreateRuleInput(toolCall.input)) continue;
    return toolCall.input;
  }

  return null;
}

function isCreateRuleInput(input: unknown): input is CreateRuleInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    name?: unknown;
    condition?: unknown;
    actions?: unknown;
  };

  return (
    typeof value.name === "string" &&
    !!value.condition &&
    typeof value.condition === "object" &&
    Array.isArray(value.actions)
  );
}

function usesStaticFromOnlyForSenders(
  createCall: CreateRuleInput | null,
  expectedSenders: string[],
) {
  return (
    usesStaticFromForSenders(createCall, expectedSenders) &&
    hasEmptyAiInstructions(createCall?.condition.aiInstructions)
  );
}

function usesStaticFromForSenders(
  createCall: CreateRuleInput | null,
  expectedSenders: string[],
) {
  if (!createCall) return false;

  const staticFrom = createCall.condition.static?.from;
  if (!staticFrom) return false;

  return staticFromIncludesAllSenders(staticFrom, expectedSenders);
}

function staticFromIncludesAllSenders(
  staticFrom: string,
  expectedSenders: string[],
) {
  const normalizedValues = splitSenderValues(staticFrom);

  return expectedSenders.every((expectedSender) => {
    const normalizedExpected = normalizeSender(expectedSender);

    return normalizedValues.includes(normalizedExpected);
  });
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

function summarizeCreateRuleCall(createCall: CreateRuleInput) {
  return [
    `name=${createCall.name}`,
    `static.from=${createCall.condition.static?.from ?? "null"}`,
    `aiInstructions=${truncate(createCall.condition.aiInstructions)}`,
  ].join("; ");
}

function summarizeToolCalls(toolCalls: RecordedToolCall[]) {
  if (toolCalls.length === 0) return "no tool calls";
  return toolCalls.map((toolCall) => toolCall.toolName).join(" | ");
}

function truncate(value: string | null | undefined, maxLength = 120) {
  if (!value) return "null";
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function hasEmptyAiInstructions(text: string | null | undefined) {
  return text == null || text.trim().length === 0;
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
