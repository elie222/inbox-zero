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
  "eval-assistant-chat-static-sender-rules-semantic",
);
const ruleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const defaultRuleRows = getDefaultRuleRows();

const scenarios = [
  {
    title:
      "uses aiInstructions without static sender filters for semantic-only rules",
    reportName: "semantic only rule (current)",
    prompt: "i want vendor escalations to stand out. label those Escalations.",
    expectation: {
      kind: "ai_only",
      terms: ["vendor", "escalation"],
    },
  },
  {
    title:
      "uses aiInstructions only for semantic matching in more natural wording",
    reportName: "semantic only natural phrasing (current)",
    prompt:
      "if a vendor relationship is going sideways, make sure those emails stand out as Escalations.",
    expectation: {
      kind: "ai_only",
      terms: ["vendor", "escalat", "relationship"],
    },
  },
  {
    title:
      "uses static.from plus aiInstructions when sender and semantic matching are both needed",
    reportName: "sender plus semantic rule (current)",
    prompt:
      "i only care about urgent notes from @partner-updates.example. label those Urgent Vendors.",
    expectation: {
      kind: "static_plus_ai",
      senders: ["@partner-updates.example"],
      terms: ["urgent"],
    },
  },
  {
    title:
      "uses static.from plus aiInstructions for a sender with a narrower semantic subset",
    reportName: "sender plus semantic natural phrasing (current)",
    prompt:
      "I don't need every message from renewals@contracts.example, just the renewal and expiration ones. Label those Renewals.",
    expectation: {
      kind: "static_plus_ai",
      senders: ["renewals@contracts.example"],
      terms: ["renewal", "expiration"],
    },
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
  "Eval: assistant chat static sender rules semantic matching",
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
      "assistant-chat static sender rules semantic matching",
      (model, emailAccount) => {
        for (const scenario of scenarios) {
          test(
            scenario.title,
            async () => {
              const result = await runAssistantChat({
                emailAccount,
                messages: [{ role: "user", content: scenario.prompt }],
              });

              const pass = evaluateScenario(
                result.createCall,
                scenario.expectation,
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

type ScenarioExpectation =
  | {
      kind: "ai_only";
      terms: string[];
    }
  | {
      kind: "static_plus_ai";
      senders: string[];
      terms: string[];
    };

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

function evaluateScenario(
  createCall: CreateRuleInput | null,
  expectation: ScenarioExpectation,
) {
  switch (expectation.kind) {
    case "ai_only":
      return usesAiInstructionsOnly(createCall, expectation.terms);
    case "static_plus_ai":
      return usesStaticFromAndInstructions(
        createCall,
        expectation.senders,
        expectation.terms,
      );
  }
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

function usesAiInstructionsOnly(
  createCall: CreateRuleInput | null,
  expectedTerms: string[],
) {
  if (!createCall) return false;

  const staticFrom = createCall.condition.static?.from;

  return (
    (!staticFrom ||
      staticFrom.trim().length === 0 ||
      staticFrom.trim() === "*" ||
      staticFrom.trim() === "*@*" ||
      staticFrom.trim() === "@") &&
    includesAnyText(createCall.condition.aiInstructions, expectedTerms)
  );
}

function usesStaticFromAndInstructions(
  createCall: CreateRuleInput | null,
  expectedSenders: string[],
  expectedTerms: string[],
) {
  if (!createCall) return false;

  const staticFrom = createCall.condition.static?.from;
  if (!staticFrom) return false;

  return (
    staticFromIncludesAllSenders(staticFrom, expectedSenders) &&
    includesAnyText(createCall.condition.aiInstructions, expectedTerms)
  );
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

function includesAnyText(text: string | null | undefined, terms: string[]) {
  if (!text) return false;

  const normalizedText = text.toLowerCase();
  return terms.some((term) => normalizedText.includes(term.toLowerCase()));
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
