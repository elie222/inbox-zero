import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatToolCalls,
  getLastMatchingToolCall,
  summarizeRecordedToolCalls,
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
import { ActionType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/assistant-chat-rule-editing
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-rule-editing

const shouldRunEval = shouldRunEvalTests();
const evalReporter = createEvalReporter();
const logger = createScopedLogger(
  "eval-assistant-chat-rule-editing-create-rule",
);
const notificationRuleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const defaultRuleRows = buildDefaultSystemRuleRows(notificationRuleUpdatedAt);
const about = "My name is Test User, and I manage a company inbox.";

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

describe.runIf(shouldRunEval)("Eval: assistant chat rule creation", () => {
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

  describeEvalMatrix("assistant-chat rule creation", (model, emailAccount) => {
    test("creates a new rule when the user explicitly asks for one", async () => {
      const { toolCalls, actual } = await runAssistantChat({
        emailAccount,
        messages: [
          {
            role: "user",
            content:
              "Create a new rule called Escalations that labels emails about vendor escalations as Escalations.",
          },
        ],
      });

      const createCall = getLastMatchingToolCall(
        toolCalls,
        "createRule",
        isCreateRuleInput,
      )?.input;
      const judgeResult = createCall
        ? await judgeEvalOutput({
            input:
              "Create a new rule called Escalations that labels emails about vendor escalations as Escalations.",
            output: createCall.condition.aiInstructions ?? "",
            expected:
              "Semantic rule instructions that capture emails about vendor escalations or vendor escalation issues. Exact wording does not need to match the prompt.",
            criterion: {
              name: "Semantic rule instructions",
              description:
                "The generated aiInstructions should semantically describe vendor escalations or equivalent vendor-issue escalation language, even if the wording differs from the prompt.",
            },
          })
        : null;

      const pass =
        !!createCall &&
        !!judgeResult?.pass &&
        !!createCall &&
        createCall.name === "Escalations" &&
        hasActionType(createCall.actions, ActionType.LABEL) &&
        hasLabelAction(createCall.actions, "Escalations") &&
        !toolCalls.some(
          (toolCall) => toolCall.toolName === "updateRuleActions",
        ) &&
        !toolCalls.some(
          (toolCall) => toolCall.toolName === "updateRuleConditions",
        ) &&
        !toolCalls.some(
          (toolCall) => toolCall.toolName === "updateLearnedPatterns",
        );

      evalReporter.record({
        testName: "create new explicit rule",
        model: model.label,
        pass,
        actual: createCall
          ? `${actual} | ${formatSemanticJudgeActual(
              createCall.condition.aiInstructions ?? "",
              judgeResult!,
            )}`
          : actual,
      });

      expect(pass).toBe(true);
    }, 120_000);
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

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

type CreateRuleInput = {
  name: string;
  condition: {
    aiInstructions?: string | null;
  };
  actions: Array<{
    type: ActionType;
    fields?: {
      label?: string | null;
    } | null;
  }>;
};

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

function hasActionType(
  actions: Array<{ type: ActionType }>,
  expectedActionType: ActionType,
) {
  return actions.some((action) => action.type === expectedActionType);
}

function hasLabelAction(
  actions: Array<{
    type: ActionType;
    fields?: {
      label?: string | null;
    } | null;
  }>,
  expectedLabel: string,
) {
  return actions.some(
    (action) =>
      action.type === ActionType.LABEL &&
      action.fields?.label === expectedLabel,
  );
}

function summarizeToolCall(toolCall: { toolName: string; input: unknown }) {
  if (isCreateRuleInput(toolCall.input)) {
    return `${toolCall.toolName}(name=${toolCall.input.name})`;
  }

  return toolCall.toolName;
}
