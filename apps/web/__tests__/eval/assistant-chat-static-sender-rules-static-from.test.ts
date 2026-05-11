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
  "eval-assistant-chat-static-sender-rules-static-from",
);
const ruleUpdatedAt = new Date("2026-03-13T00:00:00.000Z");
const defaultRuleRows = buildDefaultSystemRuleRows(ruleUpdatedAt);
const about = "I manage a busy work inbox.";

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
  {
    title: "uses static.from for a bare keep-in-inbox sender rule",
    reportName: "keep in inbox bare sender rule (current)",
    prompt:
      "create a rule called Things to keep in Inbox for daily@briefing.example and just leave those emails in the inbox",
    senders: ["daily@briefing.example"],
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
  "Eval: assistant chat static sender rules static.from",
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

  return senderListMatchesExactly(staticFrom, expectedSenders);
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
