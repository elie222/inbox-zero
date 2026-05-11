import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  captureAssistantChatToolCalls,
  getFirstMatchingToolCall,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai eval/assistant-chat-calendar
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-calendar

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-calendar");

const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

const todayDateStr = today.toISOString().slice(0, 10);
const tomorrowDateStr = tomorrow.toISOString().slice(0, 10);

const scenarios: EvalScenario[] = [
  {
    title: "activates calendar and fetches events for tomorrow",
    reportName: "calendar: meetings tomorrow",
    prompt: "What meetings do I have tomorrow?",
    expectation: {
      kind: "calendar_query",
      requiresActivateCalendar: true,
      requiresGetCalendarEvents: true,
      expectedStartDateContains: tomorrowDateStr,
    },
  },
  {
    title: "activates calendar and queries schedule for a named day",
    reportName: "calendar: schedule for Monday",
    prompt: "Check my schedule for Monday",
    expectation: {
      kind: "calendar_query",
      requiresActivateCalendar: true,
      requiresGetCalendarEvents: true,
    },
  },
  {
    title: "activates calendar with today's date for afternoon check",
    reportName: "calendar: meetings this afternoon",
    prompt: "Do I have any meetings this afternoon?",
    expectation: {
      kind: "calendar_query",
      requiresActivateCalendar: true,
      requiresGetCalendarEvents: true,
      expectedStartDateContains: todayDateStr,
    },
  },
  {
    title: "activates calendar and checks Friday's availability",
    reportName: "calendar: free on Friday",
    prompt: "Am I free on Friday?",
    expectation: {
      kind: "calendar_query",
      requiresActivateCalendar: true,
      requiresGetCalendarEvents: true,
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

vi.mock("@/utils/calendar/event-provider", () => ({
  createCalendarEventProviders: vi.fn().mockResolvedValue([
    {
      fetchEvents: vi.fn().mockResolvedValue([
        {
          id: "event-1",
          title: "Team standup",
          startTime: new Date("2026-03-19T09:00:00Z"),
          endTime: new Date("2026-03-19T09:30:00Z"),
          location: "Zoom",
          attendees: [{ email: "alice@test.com" }, { email: "bob@test.com" }],
          videoConferenceLink: "https://zoom.us/j/123",
        },
        {
          id: "event-2",
          title: "1:1 with manager",
          startTime: new Date("2026-03-19T14:00:00Z"),
          endTime: new Date("2026-03-19T14:30:00Z"),
          location: null,
          attendees: [{ email: "manager@test.com" }],
          videoConferenceLink: null,
        },
      ]),
      fetchEventsWithAttendee: vi.fn().mockResolvedValue([]),
    },
  ]),
}));

describe.runIf(shouldRunEval)("Eval: assistant chat calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockImplementation(async ({ select }) => {
      if (select?.email) {
        return {
          email: "user@test.com",
          timezone: "America/Los_Angeles",
          meetingBriefingsEnabled: true,
          meetingBriefingsMinutesBefore: 240,
          meetingBriefsSendEmail: true,
          filingEnabled: false,
          filingPrompt: null,
          filingFolders: [],
          driveConnections: [],
        };
      }

      return {
        about: "Keep replies concise.",
        rules: [],
      };
    });

    prisma.emailAccount.update.mockResolvedValue({});
  });

  describeEvalMatrix("assistant-chat calendar", (model, emailAccount) => {
    for (const scenario of scenarios) {
      test(
        scenario.title,
        async () => {
          const result = await runAssistantChat({
            emailAccount,
            messages: [{ role: "user", content: scenario.prompt }],
          });

          const pass = evaluateScenario(result, scenario.expectation);

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

type ActivateToolsInput = {
  capabilities: string[];
};

type GetCalendarEventsInput = {
  startDate?: string;
  endDate?: string;
};

type ScenarioExpectation = {
  kind: "calendar_query";
  requiresActivateCalendar: boolean;
  requiresGetCalendarEvents: boolean;
  expectedStartDateContains?: string;
};

type EvalScenario = {
  title: string;
  reportName: string;
  prompt: string;
  expectation: ScenarioExpectation;
};

function isActivateToolsInput(input: unknown): input is ActivateToolsInput {
  if (!input || typeof input !== "object") return false;
  return Array.isArray((input as { capabilities?: unknown }).capabilities);
}

function isGetCalendarEventsInput(
  input: unknown,
): input is GetCalendarEventsInput {
  if (!input || typeof input !== "object") return false;
  const value = input as Record<string, unknown>;
  return (
    (value.startDate === undefined || typeof value.startDate === "string") &&
    (value.endDate === undefined || typeof value.endDate === "string")
  );
}

function evaluateScenario(
  result: Awaited<ReturnType<typeof runAssistantChat>>,
  expectation: ScenarioExpectation,
) {
  const hasCalendarQuery = result.toolCalls.some(
    (tc) => tc.toolName === "getCalendarEvents",
  );

  if (expectation.requiresGetCalendarEvents && !hasCalendarQuery) return false;

  if (expectation.expectedStartDateContains) {
    const calendarCall = getFirstMatchingToolCall(
      result.toolCalls,
      "getCalendarEvents",
      isGetCalendarEventsInput,
    );
    if (
      !calendarCall?.input.startDate?.includes(
        expectation.expectedStartDateContains,
      )
    )
      return false;
  }

  return true;
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (
    toolCall.toolName === "activateTools" &&
    isActivateToolsInput(toolCall.input)
  ) {
    return `activateTools(${toolCall.input.capabilities.join(",")})`;
  }

  if (
    toolCall.toolName === "getCalendarEvents" &&
    isGetCalendarEventsInput(toolCall.input)
  ) {
    const input = toolCall.input;
    const parts: string[] = [];
    if (input.startDate) parts.push(`start=${input.startDate}`);
    if (input.endDate) parts.push(`end=${input.endDate}`);
    return `getCalendarEvents(${parts.join(", ")})`;
  }

  return toolCall.toolName;
}
