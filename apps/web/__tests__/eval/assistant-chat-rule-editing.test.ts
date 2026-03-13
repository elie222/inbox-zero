import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import type { getEmailAccount } from "@/__tests__/helpers";
import {
  ActionType,
  GroupItemType,
  LogicalOperator,
} from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import {
  getDefaultActions,
  getRuleConfig,
  SYSTEM_RULE_ORDER,
} from "@/utils/rule/consts";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";

// pnpm test-ai eval/assistant-chat-rule-editing
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-rule-editing

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const hasAnyEvalApiKey = Boolean(
  process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GOOGLE_API_KEY,
);
const hasDefaultEvalApiKey = Boolean(process.env.OPENROUTER_API_KEY);
const shouldRunEval = isAiTest
  ? process.env.EVAL_MODELS
    ? hasAnyEvalApiKey
    : hasDefaultEvalApiKey
  : false;
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-rule-editing");
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
  mockPrisma,
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
  mockPrisma: {
    emailAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    rule: {
      findUnique: vi.fn(),
    },
    knowledge: {
      create: vi.fn(),
    },
    chatMemory: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
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

vi.mock("@/utils/prisma", () => ({
  default: mockPrisma,
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

describe.runIf(shouldRunEval)("Eval: assistant chat rule editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRule.mockResolvedValue({ id: "created-rule-id" });
    mockPartialUpdateRule.mockResolvedValue({ id: "updated-rule-id" });
    mockUpdateRuleActions.mockResolvedValue({ id: "updated-rule-id" });
    mockSaveLearnedPatterns.mockResolvedValue({ success: true });

    mockPrisma.emailAccount.findUnique.mockImplementation(
      async ({ select }) => {
        if (select?.rules) {
          return {
            about: "My name is Test User, and I manage a company inbox.",
            rules: defaultRuleRows,
          };
        }

        return {
          about: "My name is Test User, and I manage a company inbox.",
        };
      },
    );

    mockPrisma.emailAccount.update.mockResolvedValue({
      about: "My name is Test User, and I manage a company inbox.",
    });

    mockPrisma.rule.findUnique.mockImplementation(async ({ where, select }) => {
      const ruleName = where?.name_emailAccountId?.name;
      if (ruleName === "Notification") {
        if (select?.group) {
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

  describeEvalMatrix("assistant-chat rule editing", (model, emailAccount) => {
    test(
      "extends an existing category rule with learned patterns instead of creating a duplicate rule",
      async () => {
        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content:
                "I already have a Notification rule. Add emails from @vendor-updates.example and @store-alerts.example to that rule so future emails from those senders get treated as notifications.",
            },
          ],
        });

        const updateCall = getUpdateLearnedPatternsCall(toolCalls);

        const pass =
          !!updateCall &&
          !toolCalls.some((toolCall) => toolCall.toolName === "createRule") &&
          !toolCalls.some(
            (toolCall) => toolCall.toolName === "updateRuleConditions",
          ) &&
          updateCall.ruleName === "Notification" &&
          hasIncludedFrom(
            updateCall.learnedPatterns,
            "@vendor-updates.example",
          ) &&
          hasIncludedFrom(updateCall.learnedPatterns, "@store-alerts.example");

        evalReporter.record({
          testName: "extend existing notification rule",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "uses learned pattern excludes when removing a recurring sender from an existing category rule",
      async () => {
        const { toolCalls, actual } = await runAssistantChat({
          emailAccount,
          messages: [
            {
              role: "user",
              content:
                "I already have a Notification rule. Emails from support@tickets.example should stop matching that rule.",
            },
          ],
        });

        const updateCall = getUpdateLearnedPatternsCall(toolCalls);

        const pass =
          !!updateCall &&
          !toolCalls.some((toolCall) => toolCall.toolName === "createRule") &&
          !toolCalls.some(
            (toolCall) => toolCall.toolName === "updateRuleConditions",
          ) &&
          updateCall.ruleName === "Notification" &&
          hasExcludedFrom(
            updateCall.learnedPatterns,
            "support@tickets.example",
          );

        evalReporter.record({
          testName: "exclude sender from existing notification rule",
          model: model.label,
          pass,
          actual,
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );
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
  const recordedToolCalls: Array<{ toolName: string; input: unknown }> = [];
  const recordingSession = {
    record: vi.fn(
      async (type: string, data: { request?: { toolCalls?: any[] } }) => {
        if (type !== "chat-step") return;

        for (const toolCall of data.request?.toolCalls || []) {
          recordedToolCalls.push({
            toolName: toolCall.toolName,
            input: toolCall.input,
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

  const actual =
    recordedToolCalls.length > 0
      ? recordedToolCalls.map(summarizeToolCall).join(" | ")
      : "no tool calls";

  return {
    toolCalls: recordedToolCalls,
    actual,
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

function getUpdateLearnedPatternsCall(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  const toolCall = toolCalls.find(
    (candidate) => candidate.toolName === "updateLearnedPatterns",
  );

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

function summarizeToolCall(toolCall: { toolName: string; input: unknown }) {
  if (isUpdateLearnedPatternsInput(toolCall.input)) {
    return `${toolCall.toolName}(ruleName=${toolCall.input.ruleName}, patterns=${toolCall.input.learnedPatterns.length})`;
  }

  return toolCall.toolName;
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
