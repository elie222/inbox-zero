import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
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
      mode: "append",
      semanticExpectation:
        "Updated personal instructions that remember the user's preference for concise replies.",
    },
  },
  {
    title: "uses saveMemory when asked to remember a durable preference",
    reportName: "remember preference uses saveMemory",
    prompt: "Remember that I like batching newsletters in the afternoon.",
    timeout: 120_000,
    expectation: {
      kind: "save_memory",
      forbiddenTools: ["searchMemories"],
      expectedContent: "I like batching newsletters in the afternoon.",
      expectedUserEvidence: "I like batching newsletters in the afternoon.",
    },
  },
  {
    title: "uses searchMemories when asked about remembered preferences",
    reportName: "memory lookup uses searchMemories",
    prompt: "What do you remember about my newsletter preferences?",
    expectation: {
      kind: "search_memories",
      forbiddenTools: ["saveMemory"],
      semanticExpectation:
        "A memory search query that looks up what the assistant knows about the user's newsletter preferences.",
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

              const { pass, judgeOutput, judgeResult } = await evaluateScenario(
                result,
                scenario.prompt,
                scenario.expectation,
              );

              evalReporter.record({
                testName: scenario.reportName,
                model: model.label,
                pass,
                actual:
                  judgeOutput && judgeResult
                    ? `${result.actual} | ${formatSemanticJudgeActual(
                        judgeOutput,
                        judgeResult,
                      )}`
                    : result.actual,
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
  source?: "user_message" | "assistant_inference";
  userEvidence?: string;
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
      mode: "append" | "replace";
      semanticExpectation: string;
    }
  | {
      kind: "save_memory";
      forbiddenTools: string[];
      expectedContent: string;
      expectedUserEvidence: string;
    }
  | {
      kind: "search_memories";
      forbiddenTools: string[];
      semanticExpectation: string;
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

async function evaluateScenario(
  result: Awaited<ReturnType<typeof runAssistantChat>>,
  prompt: string,
  expectation: ScenarioExpectation,
) {
  switch (expectation.kind) {
    case "capability_discovery":
      return {
        pass:
          result.toolCalls.some(
            (toolCall) => toolCall.toolName === "getAssistantCapabilities",
          ) &&
          hasNoToolCalls(result.toolCalls, [
            "updateAssistantSettings",
            "updateAssistantSettingsCompat",
          ]),
        judgeOutput: null,
        judgeResult: null,
      };

    case "assistant_settings": {
      const settingsCall = getLastMatchingToolCall(
        result.toolCalls,
        "updateAssistantSettings",
        isUpdateAssistantSettingsInput,
      )?.input;

      return {
        pass:
          !!settingsCall &&
          settingsCall.changes.some(
            (change) =>
              change.path === expectation.changePath &&
              change.value === expectation.value,
          ) &&
          hasNoToolCalls(result.toolCalls, expectation.forbiddenTools),
        judgeOutput: null,
        judgeResult: null,
      };
    }

    case "personal_instructions": {
      const aboutCall = getLastMatchingToolCall(
        result.toolCalls,
        "updatePersonalInstructions",
        isUpdateAboutInput,
      )?.input;
      const judgeResult = aboutCall
        ? await judgeEvalOutput({
            input: prompt,
            output: aboutCall.about,
            expected: expectation.semanticExpectation,
            criterion: {
              name: "Personal instructions semantics",
              description:
                "The updated personal instructions should semantically preserve the requested preference even if the wording differs from the prompt.",
            },
          })
        : null;

      return {
        pass:
          !!aboutCall &&
          !!judgeResult?.pass &&
          aboutCall.mode === expectation.mode,
        judgeOutput: aboutCall?.about ?? null,
        judgeResult,
      };
    }

    case "save_memory": {
      const memoryCall = getLastMatchingToolCall(
        result.toolCalls,
        "saveMemory",
        isSaveMemoryInput,
      )?.input;

      return {
        pass:
          !!memoryCall &&
          memoryCall.source === "user_message" &&
          normalizeMemoryText(memoryCall.content) ===
            normalizeMemoryText(expectation.expectedContent) &&
          normalizeMemoryText(memoryCall.userEvidence ?? "").includes(
            normalizeMemoryText(expectation.expectedUserEvidence),
          ) &&
          hasNoToolCalls(result.toolCalls, expectation.forbiddenTools),
        judgeOutput: memoryCall
          ? JSON.stringify({
              content: memoryCall.content,
              source: memoryCall.source,
              userEvidence: memoryCall.userEvidence,
            })
          : null,
        judgeResult: null,
      };
    }

    case "search_memories": {
      const searchCall = getLastMatchingToolCall(
        result.toolCalls,
        "searchMemories",
        isSearchMemoriesInput,
      )?.input;
      const judgeResult = searchCall
        ? await judgeEvalOutput({
            input: prompt,
            output: searchCall.query,
            expected: expectation.semanticExpectation,
            criterion: {
              name: "Memory search semantics",
              description:
                "The memory search query should semantically target the requested remembered preference, even if the wording differs from the prompt.",
            },
          })
        : null;

      return {
        pass:
          !!searchCall &&
          !!judgeResult?.pass &&
          hasNoToolCalls(result.toolCalls, expectation.forbiddenTools),
        judgeOutput: searchCall?.query ?? null,
        judgeResult,
      };
    }
  }
}

function hasNoToolCalls(toolCalls: RecordedToolCall[], toolNames: string[]) {
  return !toolCalls.some((toolCall) => toolNames.includes(toolCall.toolName));
}

function normalizeMemoryText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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
