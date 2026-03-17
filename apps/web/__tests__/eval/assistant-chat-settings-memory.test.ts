import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
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
        test(
          "uses getAssistantCapabilities for capability discovery requests",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: "What settings can you change for me from chat?",
                },
              ],
            });

            const pass =
              toolCalls.some(
                (toolCall) => toolCall.toolName === "getAssistantCapabilities",
              ) &&
              !toolCalls.some(
                (toolCall) =>
                  toolCall.toolName === "updateAssistantSettings" ||
                  toolCall.toolName === "updateAssistantSettingsCompat",
              );

            evalReporter.record({
              testName: "capability discovery uses getAssistantCapabilities",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "uses updateAssistantSettings for supported setting changes",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content: "Turn on multi-rule selection for me.",
                },
              ],
            });

            const settingsCall = getLastMatchingToolCall(
              toolCalls,
              "updateAssistantSettings",
              isUpdateAssistantSettingsInput,
            )?.input;

            const pass =
              !!settingsCall &&
              settingsCall.changes.some(
                (change) =>
                  change.path === "assistant.multiRuleSelection.enabled" &&
                  change.value === true,
              ) &&
              !toolCalls.some(
                (toolCall) =>
                  toolCall.toolName === "updateAssistantSettingsCompat",
              );

            evalReporter.record({
              testName:
                "supported settings change uses updateAssistantSettings",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "uses updatePersonalInstructions in append mode for personal instruction updates",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "Add to my personal instructions that I prefer concise replies.",
                },
              ],
            });

            const aboutCall = getLastMatchingToolCall(
              toolCalls,
              "updatePersonalInstructions",
              isUpdateAboutInput,
            )?.input;

            const pass =
              !!aboutCall &&
              aboutCall.about.toLowerCase().includes("concise") &&
              aboutCall.mode === "append";

            evalReporter.record({
              testName:
                "personal instructions use updatePersonalInstructions append",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "uses saveMemory when asked to remember a durable preference",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "Remember that I like batching newsletters in the afternoon.",
                },
              ],
            });

            const memoryCall = getLastMatchingToolCall(
              toolCalls,
              "saveMemory",
              isSaveMemoryInput,
            )?.input;

            const pass =
              !!memoryCall &&
              includesAllText(memoryCall.content, [
                "batch",
                "newsletters",
                "afternoon",
              ]) &&
              !toolCalls.some(
                (toolCall) => toolCall.toolName === "searchMemories",
              );

            evalReporter.record({
              testName: "remember preference uses saveMemory",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "uses searchMemories when asked about remembered preferences",
          async () => {
            const { toolCalls, actual } = await runAssistantChat({
              emailAccount,
              messages: [
                {
                  role: "user",
                  content:
                    "What do you remember about my newsletter preferences?",
                },
              ],
            });

            const searchCall = getLastMatchingToolCall(
              toolCalls,
              "searchMemories",
              isSearchMemoriesInput,
            )?.input;

            const pass =
              !!searchCall &&
              includesAnyText(searchCall.query, ["newsletter", "preference"]) &&
              !toolCalls.some((toolCall) => toolCall.toolName === "saveMemory");

            evalReporter.record({
              testName: "memory lookup uses searchMemories",
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );
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
  const toolCalls: Array<{ toolName: string; input: unknown }> = [];

  const result = await aiProcessAssistantChat({
    messages,
    emailAccountId: emailAccount.id,
    user: emailAccount,
    logger,
    onStepFinish: async ({ toolCalls: stepToolCalls }) => {
      for (const toolCall of stepToolCalls || []) {
        toolCalls.push({
          toolName: toolCall.toolName,
          input: toolCall.input,
        });
      }
    },
  });

  await result.consumeStream();

  const actual =
    toolCalls.length > 0
      ? toolCalls.map(summarizeToolCall).join(" | ")
      : "no tool calls";

  return {
    toolCalls,
    actual,
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

function getLastMatchingToolCall<TInput>(
  toolCalls: Array<{ toolName: string; input: unknown }>,
  toolName: string,
  matches: (input: unknown) => input is TInput,
) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (toolCall.toolName !== toolName) continue;
    if (!matches(toolCall.input)) continue;

    return {
      index,
      input: toolCall.input,
    };
  }

  return null;
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

function summarizeToolCall(toolCall: { toolName: string; input: unknown }) {
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
