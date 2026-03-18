import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  captureAssistantChatToolCalls,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { isActivePremium } from "@/utils/premium";
import { getUserPremium } from "@/utils/user/get";
import type { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai eval/assistant-chat-progressive-disclosure
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-progressive-disclosure

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-progressive-disclosure");

type EvalScenario = {
  title: string;
  reportName: string;
  prompt: string;
  expectation:
    | {
        kind: "activate_then_use";
        expectedCapabilities: string[];
        expectedFollowUpTool: string;
      }
    | {
        kind: "core_tool_no_activation";
        expectedTool: string;
      };
  timeout?: number;
};

const scenarios: EvalScenario[] = [
  {
    title: "activates labels capability before listing labels",
    reportName: "list labels activates labels capability",
    prompt: "List my labels",
    expectation: {
      kind: "activate_then_use",
      expectedCapabilities: ["labels"],
      expectedFollowUpTool: "listLabels",
    },
  },
  {
    title: "activates knowledge capability before adding to knowledge base",
    reportName: "save to knowledge base activates knowledge capability",
    prompt: "Save this to my knowledge base: always reply with bullet points",
    expectation: {
      kind: "activate_then_use",
      expectedCapabilities: ["knowledge"],
      expectedFollowUpTool: "addToKnowledgeBase",
    },
  },
  {
    title: "activates memory capability before saving memory",
    reportName: "remember preference activates memory capability",
    prompt: "Remember that I prefer morning summaries",
    expectation: {
      kind: "activate_then_use",
      expectedCapabilities: ["memory"],
      expectedFollowUpTool: "saveMemory",
    },
    timeout: 120_000,
  },
  {
    title: "activates settings capability for feature toggle",
    reportName: "toggle setting activates settings capability",
    prompt: "Turn on auto-file attachments",
    expectation: {
      kind: "activate_then_use",
      expectedCapabilities: ["settings"],
      expectedFollowUpTool: "updateAssistantSettings",
    },
  },
  {
    title: "activates calendar capability before fetching events",
    reportName: "calendar query activates calendar capability",
    prompt: "What's on my calendar tomorrow?",
    expectation: {
      kind: "activate_then_use",
      expectedCapabilities: ["calendar"],
      expectedFollowUpTool: "getCalendarEvents",
    },
  },
  {
    title: "does not need activateTools for core inbox management",
    reportName: "archive emails uses core tool without activation",
    prompt: "Archive emails from newsletters@example.com",
    expectation: {
      kind: "core_tool_no_activation",
      expectedTool: "manageInbox",
    },
  },
  {
    title: "does not need activateTools for core search",
    reportName: "search inbox uses core tool without activation",
    prompt: "Search my inbox for emails from John",
    expectation: {
      kind: "core_tool_no_activation",
      expectedTool: "searchInbox",
    },
  },
];

const { mockPosthogCaptureEvent, mockRedis } = vi.hoisted(() => ({
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

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: mockPosthogCaptureEvent,
  getPosthogLlmClient: () => null,
}));

vi.mock("@/utils/redis", () => ({
  redis: mockRedis,
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/premium", () => ({
  isActivePremium: vi.fn(),
}));
vi.mock("@/utils/user/get", () => ({
  getUserPremium: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

const mockIsActivePremium = vi.mocked(isActivePremium);
const mockGetUserPremium = vi.mocked(getUserPremium);

const baseAccountSnapshot = {
  id: "email-account-1",
  email: "user@test.com",
  timezone: "America/Los_Angeles",
  about: "Keep replies concise.",
  multiRuleSelectionEnabled: false,
  meetingBriefingsEnabled: true,
  meetingBriefingsMinutesBefore: 240,
  meetingBriefsSendEmail: true,
  filingEnabled: false,
  filingPrompt: null,
  writingStyle: "Friendly",
  signature: "Best,\nUser",
  includeReferralSignature: false,
  followUpAwaitingReplyDays: 3,
  followUpNeedsReplyDays: 2,
  followUpAutoDraftEnabled: true,
  digestSchedule: {
    id: "digest-1",
    intervalDays: 1,
    occurrences: 1,
    daysOfWeek: 127,
    timeOfDay: new Date("1970-01-01T09:00:00.000Z"),
    nextOccurrenceAt: new Date("2026-02-21T09:00:00.000Z"),
  },
  rules: [],
  automationJob: {
    id: "automation-job-1",
    enabled: true,
    cronExpression: "0 9 * * 1-5",
    prompt: "Highlight urgent items.",
    nextRunAt: new Date("2026-02-21T09:00:00.000Z"),
    messagingChannelId: "channel-1",
    messagingChannel: {
      channelName: "inbox-updates",
      teamName: "Acme",
    },
  },
  messagingChannels: [
    {
      id: "channel-1",
      provider: "SLACK",
      channelName: "inbox-updates",
      teamName: "Acme",
      isConnected: true,
      accessToken: "token-1",
      providerUserId: "U123",
      channelId: null,
    },
  ],
  knowledge: [
    {
      id: "knowledge-1",
      title: "Reply style",
      content: "Use concise bullet points.",
      updatedAt: new Date("2026-02-20T08:00:00.000Z"),
    },
  ],
};

describe.runIf(shouldRunEval)(
  "Eval: assistant chat progressive tool disclosure",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mockGetUserPremium.mockResolvedValue({});
      mockIsActivePremium.mockReturnValue(true);

      prisma.emailAccount.findUnique.mockResolvedValue(baseAccountSnapshot);
      prisma.emailAccount.update.mockResolvedValue({});
      prisma.automationJob.findUnique.mockResolvedValue(
        baseAccountSnapshot.automationJob,
      );
      prisma.chatMemory.findMany.mockResolvedValue([]);
      prisma.chatMemory.findFirst.mockResolvedValue(null);
      prisma.chatMemory.create.mockResolvedValue({});
      prisma.knowledge.upsert.mockResolvedValue({});
    });

    describeEvalMatrix(
      "assistant-chat progressive disclosure",
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
                result.toolCalls,
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
            scenario.timeout ?? TIMEOUT,
          );
        }
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

function evaluateScenario(
  toolCalls: RecordedToolCall[],
  expectation: EvalScenario["expectation"],
): boolean {
  switch (expectation.kind) {
    case "activate_then_use": {
      const activateIndex = toolCalls.findIndex(
        (tc) =>
          tc.toolName === "activateTools" &&
          isActivateToolsInput(tc.input) &&
          expectation.expectedCapabilities.every((cap) =>
            (tc.input as ActivateToolsInput).capabilities.includes(cap),
          ),
      );

      if (activateIndex < 0) return false;

      const followUpIndex = toolCalls.findIndex(
        (tc, i) =>
          i > activateIndex && tc.toolName === expectation.expectedFollowUpTool,
      );

      return followUpIndex > activateIndex;
    }

    case "core_tool_no_activation": {
      const hasActivateCall = toolCalls.some(
        (tc) => tc.toolName === "activateTools",
      );
      const hasCoreToolCall = toolCalls.some(
        (tc) => tc.toolName === expectation.expectedTool,
      );

      return !hasActivateCall && hasCoreToolCall;
    }
  }
}

type ActivateToolsInput = {
  capabilities: string[];
};

function isActivateToolsInput(input: unknown): input is ActivateToolsInput {
  if (!input || typeof input !== "object") return false;
  const value = input as { capabilities?: unknown };
  return (
    Array.isArray(value.capabilities) &&
    value.capabilities.every((c: unknown) => typeof c === "string")
  );
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (
    toolCall.toolName === "activateTools" &&
    isActivateToolsInput(toolCall.input)
  ) {
    return `activateTools([${toolCall.input.capabilities.join(", ")}])`;
  }

  return toolCall.toolName;
}
