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

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-progressive-disclosure");

const { mockCreateEmailProvider, mockPosthogCaptureEvent, mockRedis } =
  vi.hoisted(() => ({
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

type EvalScenario = {
  title: string;
  reportName: string;
  prompt: string;
  expectedTool: string;
  disallowedTools?: string[];
  timeout?: number;
};

const scenarios: EvalScenario[] = [
  {
    title: "calls listLabels for label listing requests",
    reportName: "list labels calls listLabels",
    prompt: "List my labels",
    expectedTool: "listLabels",
  },
  {
    title: "calls addToKnowledgeBase for knowledge base requests",
    reportName: "save to knowledge base calls addToKnowledgeBase",
    prompt:
      "Save this to my knowledge base: The refund window is 30 days after purchase.",
    expectedTool: "addToKnowledgeBase",
    disallowedTools: ["saveMemory", "updatePersonalInstructions"],
  },
  {
    title: "calls updatePersonalInstructions for global behavior requests",
    reportName: "global behavior preference calls updatePersonalInstructions",
    prompt:
      "Update my personal instructions: when drafting replies, keep the tone formal.",
    expectedTool: "updatePersonalInstructions",
    disallowedTools: ["saveMemory", "addToKnowledgeBase"],
    timeout: 120_000,
  },
  {
    title: "calls saveMemory for chat recall facts",
    reportName: "chat recall fact calls saveMemory",
    prompt: "Remember that the project codename is Atlas.",
    expectedTool: "saveMemory",
    disallowedTools: ["updatePersonalInstructions", "addToKnowledgeBase"],
    timeout: 120_000,
  },
  {
    title: "calls updateAssistantSettings for feature toggle",
    reportName: "toggle setting calls updateAssistantSettings",
    prompt: "Turn on auto-file attachments",
    expectedTool: "updateAssistantSettings",
  },
  {
    title: "calls getCalendarEvents for calendar queries",
    reportName: "calendar query calls getCalendarEvents",
    prompt: "What's on my calendar tomorrow?",
    expectedTool: "getCalendarEvents",
  },
  {
    title: "calls manageInbox for archive requests",
    reportName: "archive emails calls manageInbox",
    prompt: "Archive emails from newsletters@example.com",
    expectedTool: "manageInbox",
  },
  {
    title: "calls searchInbox for search requests",
    reportName: "search inbox calls searchInbox",
    prompt: "Search my inbox for emails from John",
    expectedTool: "searchInbox",
  },
];

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
  createEmailProvider: mockCreateEmailProvider,
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
      mockCreateEmailProvider.mockResolvedValue({
        searchMessages: vi.fn().mockResolvedValue({
          messages: [
            {
              id: "msg-newsletter-1",
              threadId: "thread-newsletter-1",
              headers: {
                from: "newsletters@example.com",
                to: "user@test.com",
                subject: "Weekly roundup",
                date: new Date().toISOString(),
              },
              snippet: "This week's updates.",
              textPlain: "This week's updates.",
              textHtml: "<p>This week's updates.</p>",
              attachments: [],
              inline: [],
              labelIds: ["INBOX"],
              subject: "Weekly roundup",
              date: new Date().toISOString(),
            },
          ],
          nextPageToken: undefined,
        }),
        getMessagesWithPagination: vi.fn().mockResolvedValue({
          messages: [],
          nextPageToken: undefined,
        }),
        getLabels: vi.fn().mockResolvedValue([
          { id: "INBOX", name: "INBOX" },
          { id: "UNREAD", name: "UNREAD" },
        ]),
        getThreadMessages: vi
          .fn()
          .mockImplementation(async (threadId: string) => [
            { id: `${threadId}-message-1`, threadId },
          ]),
        archiveThreadWithLabel: vi.fn().mockResolvedValue(undefined),
        markReadThread: vi.fn().mockResolvedValue(undefined),
        bulkArchiveFromSenders: vi.fn().mockResolvedValue(undefined),
      });
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

              const pass = evaluateScenario(result.toolCalls, scenario);

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
  scenario: EvalScenario,
): boolean {
  const calledExpectedTool = toolCalls.some(
    (tc) => tc.toolName === scenario.expectedTool,
  );
  const calledDisallowedTool = scenario.disallowedTools?.some((toolName) =>
    toolCalls.some((tc) => tc.toolName === toolName),
  );

  return calledExpectedTool && !calledDisallowedTool;
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  return toolCall.toolName;
}
