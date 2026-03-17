import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  captureAssistantChatToolCalls,
  getLastMatchingToolCall,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { isActivePremium } from "@/utils/premium";
import { getUserPremium } from "@/utils/user/get";
import type { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai eval/assistant-chat-settings-memory
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-settings-memory

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-settings-memory");
const scenarios: EvalScenario[] = [
  {
    title: "uses getAssistantCapabilities for capability discovery requests",
    reportName: "capability discovery uses getAssistantCapabilities",
    prompt: "What settings can you change for me from chat?",
    expectation: {
      kind: "capability_discovery",
    },
  },
  {
    title: "uses updateAssistantSettings for supported setting changes",
    reportName: "supported settings change uses updateAssistantSettings",
    prompt: "Turn on multi-rule selection for me.",
    expectation: {
      kind: "assistant_settings",
      changePath: "assistant.multiRuleSelection.enabled",
      value: true,
      forbiddenTools: ["updateAssistantSettingsCompat"],
    },
  },
  {
    title:
      "uses updatePersonalInstructions in append mode for personal instruction updates",
    reportName: "personal instructions use updatePersonalInstructions append",
    prompt: "Add to my personal instructions that I prefer concise replies.",
    expectation: {
      kind: "personal_instructions",
      terms: ["concise"],
      mode: "append",
    },
  },
  {
    title: "uses saveMemory when asked to remember a durable preference",
    reportName: "remember preference uses saveMemory",
    prompt: "Remember that I like batching newsletters in the afternoon.",
    timeout: 120_000,
    expectation: {
      kind: "save_memory",
      terms: ["batch", "newsletter", "afternoon"],
      forbiddenTools: ["searchMemories"],
    },
  },
  {
    title: "uses searchMemories when asked about remembered preferences",
    reportName: "memory lookup uses searchMemories",
    prompt: "What do you remember about my newsletter preferences?",
    expectation: {
      kind: "search_memories",
      terms: ["newsletter", "preference"],
      forbiddenTools: ["saveMemory"],
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
  "Eval: assistant chat settings and memory",
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
      prisma.chatMemory.findMany.mockResolvedValue([
        {
          content: "User likes batching newsletters in the afternoon.",
          createdAt: new Date("2026-03-15T08:00:00.000Z"),
        },
      ]);
      prisma.chatMemory.findFirst.mockResolvedValue(null);
      prisma.chatMemory.create.mockResolvedValue({});
      prisma.knowledge.upsert.mockResolvedValue({});
    });

    describeEvalMatrix(
      "assistant-chat settings and memory",
      (model, emailAccount) => {
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

type UpdateAssistantSettingsInput = {
  changes: Array<{
    path: string;
    value: unknown;
    mode?: "append" | "replace";
  }>;
};

type SaveMemoryInput = {
  content: string;
};

type SearchMemoriesInput = {
  query: string;
};

type UpdateAboutInput = {
  about: string;
  mode?: "append" | "replace";
};

type ScenarioExpectation =
  | {
      kind: "capability_discovery";
    }
  | {
      kind: "assistant_settings";
      changePath: string;
      value: unknown;
      forbiddenTools: string[];
    }
  | {
      kind: "personal_instructions";
      terms: string[];
      mode: "append" | "replace";
    }
  | {
      kind: "save_memory";
      terms: string[];
      forbiddenTools: string[];
    }
  | {
      kind: "search_memories";
      terms: string[];
      forbiddenTools: string[];
    };

type EvalScenario = {
  title: string;
  reportName: string;
  prompt: string;
  timeout?: number;
  expectation: ScenarioExpectation;
};

function isUpdateAssistantSettingsInput(
  input: unknown,
): input is UpdateAssistantSettingsInput {
  if (!input || typeof input !== "object") return false;

  return Array.isArray((input as { changes?: unknown }).changes);
}

function isSaveMemoryInput(input: unknown): input is SaveMemoryInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { content?: unknown }).content === "string"
  );
}

function isSearchMemoriesInput(input: unknown): input is SearchMemoriesInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { query?: unknown }).query === "string"
  );
}

function isUpdateAboutInput(input: unknown): input is UpdateAboutInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    about?: unknown;
    mode?: unknown;
  };

  return (
    typeof value.about === "string" &&
    (value.mode == null || value.mode === "append" || value.mode === "replace")
  );
}

function evaluateScenario(
  result: Awaited<ReturnType<typeof runAssistantChat>>,
  expectation: ScenarioExpectation,
) {
  switch (expectation.kind) {
    case "capability_discovery":
      return (
        result.toolCalls.some(
          (toolCall) => toolCall.toolName === "getAssistantCapabilities",
        ) &&
        hasNoToolCalls(result.toolCalls, [
          "updateAssistantSettings",
          "updateAssistantSettingsCompat",
        ])
      );

    case "assistant_settings": {
      const settingsCall = getLastMatchingToolCall(
        result.toolCalls,
        "updateAssistantSettings",
        isUpdateAssistantSettingsInput,
      )?.input;

      return (
        !!settingsCall &&
        settingsCall.changes.some(
          (change) =>
            change.path === expectation.changePath &&
            change.value === expectation.value,
        ) &&
        hasNoToolCalls(result.toolCalls, expectation.forbiddenTools)
      );
    }

    case "personal_instructions": {
      const aboutCall = getLastMatchingToolCall(
        result.toolCalls,
        "updatePersonalInstructions",
        isUpdateAboutInput,
      )?.input;

      return (
        !!aboutCall &&
        includesAnyText(aboutCall.about, expectation.terms) &&
        aboutCall.mode === expectation.mode
      );
    }

    case "save_memory": {
      const memoryCall = getLastMatchingToolCall(
        result.toolCalls,
        "saveMemory",
        isSaveMemoryInput,
      )?.input;

      return (
        !!memoryCall &&
        includesAllText(memoryCall.content, expectation.terms) &&
        hasNoToolCalls(result.toolCalls, expectation.forbiddenTools)
      );
    }

    case "search_memories": {
      const searchCall = getLastMatchingToolCall(
        result.toolCalls,
        "searchMemories",
        isSearchMemoriesInput,
      )?.input;

      return (
        !!searchCall &&
        includesAnyText(searchCall.query, expectation.terms) &&
        hasNoToolCalls(result.toolCalls, expectation.forbiddenTools)
      );
    }
  }
}

function includesAnyText(text: string | null | undefined, terms: string[]) {
  if (!text) return false;

  const normalizedText = text.toLowerCase();
  return terms.some((term) => normalizedText.includes(term.toLowerCase()));
}

function includesAllText(text: string | null | undefined, terms: string[]) {
  if (!text) return false;

  const normalizedText = text.toLowerCase();
  return terms.every((term) => normalizedText.includes(term.toLowerCase()));
}

function hasNoToolCalls(toolCalls: RecordedToolCall[], toolNames: string[]) {
  return !toolCalls.some((toolCall) => toolNames.includes(toolCall.toolName));
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (toolCall.toolName === "getAssistantCapabilities") {
    return "getAssistantCapabilities()";
  }

  if (isUpdateAssistantSettingsInput(toolCall.input)) {
    return `${toolCall.toolName}(changes=${toolCall.input.changes.length})`;
  }

  if (isSaveMemoryInput(toolCall.input)) {
    return `${toolCall.toolName}(${toolCall.input.content})`;
  }

  if (isSearchMemoriesInput(toolCall.input)) {
    return `${toolCall.toolName}(${toolCall.input.query})`;
  }

  if (isUpdateAboutInput(toolCall.input)) {
    return `${toolCall.toolName}(mode=${toolCall.input.mode ?? "replace"})`;
  }

  return toolCall.toolName;
}
