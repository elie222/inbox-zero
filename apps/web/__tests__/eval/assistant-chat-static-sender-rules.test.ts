import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import type { getEmailAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import {
  getDefaultActions,
  getRuleConfig,
  SYSTEM_RULE_ORDER,
} from "@/utils/rule/consts";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";

// pnpm test-ai eval/assistant-chat-static-sender-rules
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-static-sender-rules

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 90_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-static-sender-rules");
const ruleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const defaultRuleRows = getDefaultRuleRows();

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
  "Eval: assistant chat static sender rules",
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
      "assistant-chat static sender rules",
      (model, emailAccount) => {
        test(
          "uses static.from for an exact newsletter sender domain",
          async () => {
            const messages: ModelMessage[] = [
              {
                role: "user",
                content:
                  'Create a rule called "TLDR Newsletters" that labels emails from @tldrnewsletter.com as TLDR Newsletters.',
              },
            ];

            const current = await runAssistantChat({
              emailAccount,
              messages,
            });

            const currentPass = usesStaticFromForSenders(current.createCall, [
              "@tldrnewsletter.com",
            ]);

            evalReporter.record({
              testName: "newsletter sender domain (current)",
              model: model.label,
              pass: currentPass,
              actual: current.actual,
            });

            expect(currentPass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "uses static.from for a small explicit travel sender list",
          async () => {
            const messages: ModelMessage[] = [
              {
                role: "user",
                content:
                  'Create a rule called "Travel" that labels and marks as read emails from @airbnb.com, @booking.com, and @delta.com.',
              },
            ];

            const current = await runAssistantChat({
              emailAccount,
              messages,
            });

            const currentPass = usesStaticFromForSenders(current.createCall, [
              "@airbnb.com",
              "@booking.com",
              "@delta.com",
            ]);

            evalReporter.record({
              testName: "travel sender list (current)",
              model: model.label,
              pass: currentPass,
              actual: current.actual,
            });

            expect(currentPass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "uses aiInstructions without static sender filters for semantic-only rules",
          async () => {
            const messages: ModelMessage[] = [
              {
                role: "user",
                content:
                  'Create a rule called "Escalations" that labels emails about vendor escalations as Escalations.',
              },
            ];

            const current = await runAssistantChat({
              emailAccount,
              messages,
            });

            const currentPass = usesAiInstructionsOnly(current.createCall, [
              "vendor",
              "escalation",
            ]);

            evalReporter.record({
              testName: "semantic only rule (current)",
              model: model.label,
              pass: currentPass,
              actual: current.actual,
            });

            expect(current.toolCalls.length).toBeGreaterThan(0);
          },
          TIMEOUT,
        );

        test(
          "uses static.from plus aiInstructions when sender and semantic matching are both needed",
          async () => {
            const messages: ModelMessage[] = [
              {
                role: "user",
                content:
                  'Create a rule called "Urgent Vendors" that labels urgent emails from @partner-updates.example as Urgent Vendors.',
              },
            ];

            const current = await runAssistantChat({
              emailAccount,
              messages,
            });

            const currentPass = usesStaticFromAndInstructions(
              current.createCall,
              ["@partner-updates.example"],
              ["urgent"],
            );

            evalReporter.record({
              testName: "sender plus semantic rule (current)",
              model: model.label,
              pass: currentPass,
              actual: current.actual,
            });

            expect(currentPass).toBe(true);
          },
          TIMEOUT,
        );

        test("uses learned patterns when adding a recurring sender to the Newsletter rule", async () => {
          const messages: ModelMessage[] = [
            {
              role: "user",
              content:
                "I already have a Newsletter rule. Emails from newsletter@morningbrew.com should match that rule.",
            },
          ];

          const current = await runAssistantChat({
            emailAccount,
            messages,
          });

          const updateCall = findUpdateLearnedPatternsCall(
            current.toolCalls,
            (input) =>
              input.ruleName === "Newsletter" &&
              hasIncludedFrom(
                input.learnedPatterns,
                "newsletter@morningbrew.com",
              ),
          );

          const currentPass =
            !!updateCall &&
            !current.toolCalls.some(
              (toolCall) => toolCall.toolName === "createRule",
            ) &&
            mockSaveLearnedPatterns.mock.calls.length > 0;

          evalReporter.record({
            testName: "newsletter learned pattern update (current)",
            model: model.label,
            pass: currentPass,
            actual: current.actual,
          });

          expect(current.toolCalls.length).toBeGreaterThan(0);
        }, 120_000);
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

async function runAssistantChat({
  emailAccount,
  messages,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
}) {
  const recordedToolCalls: Array<{ toolName: string; input: unknown }> = [];
  const recordingSession = {
    record: vi.fn(
      async (type: string, data: { request?: { toolCalls?: unknown[] } }) => {
        if (type !== "chat-step") return;

        for (const toolCall of data.request?.toolCalls || []) {
          const value = toolCall as {
            toolName?: unknown;
            input?: unknown;
          };

          if (typeof value.toolName !== "string") continue;

          recordedToolCalls.push({
            toolName: value.toolName,
            input: value.input,
          });
        }
      },
    ),
  };

  const result = await aiProcessAssistantChat({
    messages,
    emailAccountId: emailAccount.id,
    user: emailAccount,
    logger,
    recordingSession,
  });

  await result.consumeStream();

  const createCall = getLastCreateRuleCall(recordedToolCalls);
  const learnedPatternsCall = findUpdateLearnedPatternsCall(
    recordedToolCalls,
    () => true,
  );
  const actual = createCall
    ? summarizeCreateRuleCall(createCall)
    : learnedPatternsCall
      ? summarizeUpdateLearnedPatternsCall(learnedPatternsCall)
      : summarizeToolCalls(recordedToolCalls);

  return {
    createCall,
    actual,
    toolCalls: recordedToolCalls,
  };
}

function getLastCreateRuleCall(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
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

function usesStaticFromForSenders(
  createCall: CreateRuleInput | null,
  expectedSenders: string[],
) {
  if (!createCall) return false;

  const staticFrom = createCall.condition.static?.from;
  if (!staticFrom) return false;

  return staticFromIncludesAllSenders(staticFrom, expectedSenders);
}

function usesAiInstructionsOnly(
  createCall: CreateRuleInput | null,
  expectedTerms: string[],
) {
  if (!createCall) return false;

  return (
    (!createCall.condition.static?.from ||
      createCall.condition.static.from.trim() === "*") &&
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
  const normalizedValues = staticFrom
    .split(/[|,\n]/)
    .map((value) => normalizeSender(value))
    .filter(Boolean);

  return expectedSenders.every((expectedSender) => {
    const normalizedExpected = normalizeSender(expectedSender);

    return normalizedValues.some(
      (value) =>
        value === normalizedExpected ||
        value.includes(normalizedExpected) ||
        normalizedExpected.includes(value),
    );
  });
}

function normalizeSender(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

function summarizeCreateRuleCall(createCall: CreateRuleInput) {
  return [
    `name=${createCall.name}`,
    `static.from=${createCall.condition.static?.from ?? "null"}`,
    `aiInstructions=${truncate(createCall.condition.aiInstructions)}`,
  ].join("; ");
}

function findUpdateLearnedPatternsCall(
  toolCalls: Array<{ toolName: string; input: unknown }>,
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

function summarizeToolCalls(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  if (toolCalls.length === 0) return "no tool calls";
  return toolCalls.map((toolCall) => toolCall.toolName).join(" | ");
}

function summarizeUpdateLearnedPatternsCall(
  updateCall: UpdateLearnedPatternsInput,
) {
  return `updateLearnedPatterns(rule=${updateCall.ruleName}; patterns=${updateCall.learnedPatterns.length})`;
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

function senderMatches(actual: string, expected: string) {
  const normalizedActual = normalizeSender(actual);
  const normalizedExpected = normalizeSender(expected);

  return (
    normalizedActual === normalizedExpected ||
    normalizedActual.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedActual)
  );
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
