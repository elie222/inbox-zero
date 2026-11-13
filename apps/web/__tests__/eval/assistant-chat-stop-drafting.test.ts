import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  getLastRuleActionsUpdate,
  hasActionType,
  hasLabelAction,
  summarizeRecordedToolCalls,
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
import { ActionType, SystemType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/assistant-chat-stop-drafting
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-stop-drafting

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 240_000;
const evalReporter = createEvalReporter({
  evalName: "assistant-chat-stop-drafting",
});
const logger = createScopedLogger("eval-assistant-chat-stop-drafting");
const about = "My name is Test User, and I manage a company inbox.";
const ruleRows = buildDefaultSystemRuleRows(
  new Date("2026-03-13T00:00:00.000Z"),
).map((rule) =>
  rule.systemType === SystemType.TO_REPLY
    ? {
        ...rule,
        actions: [
          ...rule.actions,
          { ...rule.actions[0], type: ActionType.DRAFT_EMAIL, label: null },
        ],
      }
    : rule,
);
const toReplyRule = ruleRows.find(
  (rule) => rule.systemType === SystemType.TO_REPLY,
);
const toReplyLabel = toReplyRule?.actions.find(
  (action) => action.type === ActionType.LABEL,
)?.label;

const scenarios = [
  { name: "english", message: "Stop drafting replies for me." },
  { name: "spanish", message: "Deja de redactar borradores de respuesta." },
];

const {
  mockCreateRule,
  mockPartialUpdateRule,
  mockUpdateRuleActions,
  mockSaveLearnedPatterns,
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
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

vi.mock("@/utils/prisma");

vi.mock("@/env", async () => {
  const { buildAssistantChatEvalEnv } = await vi.importActual<
    typeof import("@/__tests__/eval/assistant-chat-eval-env")
  >("@/__tests__/eval/assistant-chat-eval-env");

  return {
    env: buildAssistantChatEvalEnv(),
  };
});

describe.runIf(shouldRunEval)("Eval: assistant chat stop drafting", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    configureRuleMutationMocks({
      mockCreateRule,
      mockPartialUpdateRule,
      mockUpdateRuleActions,
      mockSaveLearnedPatterns,
    });
    configureRuleEvalPrisma({ about, ruleRows });
    configureRuleEvalProvider({ mockCreateEmailProvider, ruleRows });
  });

  describeEvalMatrix("assistant-chat stop drafting", (model, emailAccount) => {
    for (const scenario of scenarios) {
      test(
        `removes the To Reply draft action and keeps labelling (${scenario.name})`,
        async () => {
          const toolCalls = await captureAssistantChatToolCalls({
            messages: [{ role: "user", content: scenario.message }],
            emailAccount,
            logger,
          });

          const updateCall = getLastRuleActionsUpdate(toolCalls);
          const pass =
            !!updateCall &&
            updateCall.ruleName === toReplyRule?.name &&
            !!toReplyLabel &&
            !hasActionType(updateCall.actions, ActionType.DRAFT_EMAIL) &&
            hasLabelAction(updateCall.actions, toReplyLabel) &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "updatePersonalInstructions" ||
                (toolCall.toolName === "updateRule" &&
                  (toolCall.input as { updates?: { enabled?: boolean } })
                    ?.updates?.enabled === false),
            );

          evalReporter.record({
            testName: `stop drafting (${scenario.name})`,
            model: model.label,
            pass,
            actual: summarizeRecordedToolCalls(
              toolCalls,
              (toolCall) =>
                `${toolCall.toolName}(${JSON.stringify(toolCall.input)})`,
            ),
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});
