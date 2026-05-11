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
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import {
  buildDefaultSystemRuleRows,
  configureRuleEvalPrisma,
  configureRuleEvalProvider,
  configureRuleMutationMocks,
  senderListMatchesExactly,
} from "@/__tests__/eval/assistant-chat-rule-eval-test-utils";
import type { getEmailAccount } from "@/__tests__/helpers";
import type { ActionType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/assistant-chat-static-sender-rules
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-static-sender-rules

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 150_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger(
  "eval-assistant-chat-static-sender-rules-semantic",
);
const ruleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const defaultRuleRows = buildDefaultSystemRuleRows(ruleUpdatedAt);
const about = "I manage a busy work inbox.";

const scenarios = [
  {
    title:
      "uses aiInstructions without static sender filters for semantic-only rules",
    reportName: "semantic only rule (current)",
    prompt: "i want vendor escalations to stand out. label those Escalations.",
    expectation: {
      kind: "ai_only",
      instructionExpectation:
        "Semantic rule instructions that capture vendor escalations or vendor issues that should stand out as escalations.",
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
      instructionExpectation:
        "Semantic rule instructions that capture vendor relationships going badly or escalating vendor issues, even if the wording differs from the prompt.",
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
      instructionExpectation:
        "Semantic rule instructions that narrow matching to urgent notes from the specified sender domain.",
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
      instructionExpectation:
        "Semantic rule instructions that narrow matching to renewal or expiration emails from the specified sender.",
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
  "Eval: assistant chat static sender rules semantic matching",
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
      });

      configureRuleEvalProvider({
        mockCreateEmailProvider,
        ruleRows: defaultRuleRows,
        includeCreateLabel: true,
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

              const judgeResult = result.createCall
                ? await judgeAiInstructions(
                    scenario.prompt,
                    result.createCall.condition.aiInstructions ?? "",
                    scenario.expectation.instructionExpectation,
                  )
                : null;
              const pass = await evaluateScenario(
                result.createCall,
                judgeResult,
                scenario.expectation,
              );

              evalReporter.record({
                testName: scenario.reportName,
                model: model.label,
                pass,
                actual:
                  result.createCall && judgeResult
                    ? `${result.actual} | ${formatSemanticJudgeActual(
                        result.createCall.condition.aiInstructions ?? "",
                        judgeResult,
                      )}`
                    : result.actual,
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
      instructionExpectation: string;
    }
  | {
      kind: "static_plus_ai";
      senders: string[];
      instructionExpectation: string;
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

async function evaluateScenario(
  createCall: CreateRuleInput | null,
  judgeResult: Awaited<ReturnType<typeof judgeAiInstructions>> | null,
  expectation: ScenarioExpectation,
) {
  switch (expectation.kind) {
    case "ai_only":
      return usesAiInstructionsOnly(createCall, judgeResult);
    case "static_plus_ai":
      return usesStaticFromAndInstructions(
        createCall,
        expectation.senders,
        judgeResult,
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
  judgeResult: Awaited<ReturnType<typeof judgeAiInstructions>> | null,
) {
  if (!createCall) return false;

  const staticFrom = createCall.condition.static?.from;

  return (!staticFrom || staticFrom.trim().length === 0) && !!judgeResult?.pass;
}

function usesStaticFromAndInstructions(
  createCall: CreateRuleInput | null,
  expectedSenders: string[],
  judgeResult: Awaited<ReturnType<typeof judgeAiInstructions>> | null,
) {
  if (!createCall) return false;

  const staticFrom = createCall.condition.static?.from;
  if (!staticFrom) return false;

  return (
    senderListMatchesExactly(staticFrom, expectedSenders) && !!judgeResult?.pass
  );
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

async function judgeAiInstructions(
  prompt: string,
  aiInstructions: string,
  instructionExpectation: string,
) {
  return judgeEvalOutput({
    input: prompt,
    output: aiInstructions,
    expected: instructionExpectation,
    criterion: {
      name: "Semantic aiInstructions",
      description:
        "The generated aiInstructions should semantically capture the requested rule behavior even if the wording differs from the prompt.",
    },
  });
}
