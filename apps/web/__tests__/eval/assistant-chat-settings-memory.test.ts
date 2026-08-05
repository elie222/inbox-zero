import { isDeepStrictEqual } from "node:util";
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
  captureAssistantChatTrace,
  getFirstMatchingToolCall,
  getLastMatchingToolCall,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  settingsMemoryScenarios,
  type AssistantSettingsChangeExpectation,
  type SettingsMemoryScenario,
  type SettingsMemoryScenarioExpectation,
} from "@/__tests__/eval/assistant-chat-settings-memory.scenarios";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { isActivePremium } from "@/utils/premium";
import { getUserPremium } from "@/utils/user/get";
import type { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai eval/assistant-chat-settings-memory
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-settings-memory

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter({
  evalName: "assistant-chat-settings-memory",
});
const logger = createScopedLogger("eval-assistant-chat-settings-memory");
const selectedScenarios =
  process.env.EVAL_MODELS === "all"
    ? settingsMemoryScenarios.filter((scenario) => scenario.crossModelCanary)
    : settingsMemoryScenarios;

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

vi.mock("@/env", async () => {
  const { buildAssistantChatEvalEnv } = await vi.importActual<
    typeof import("@/__tests__/eval/assistant-chat-eval-env")
  >("@/__tests__/eval/assistant-chat-eval-env");

  return {
    env: buildAssistantChatEvalEnv(),
  };
});

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
  digestSendEmail: true,
  digestSchedule: {
    id: "digest-1",
    intervalDays: 1,
    occurrences: 1,
    daysOfWeek: 127,
    timeOfDay: new Date("1970-01-01T09:00:00.000Z"),
    nextOccurrenceAt: new Date("2026-02-21T09:01:00.000Z"),
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
      provider: "SLACK",
      channelName: "inbox-updates",
      teamName: "Acme",
      routes: [],
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
      teamId: "team-1",
      providerUserId: "U123",
      channelId: null,
      routes: [],
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
let accountSnapshot: typeof baseAccountSnapshot;

describe.runIf(shouldRunEval)(
  "Eval: assistant chat settings and memory",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mockGetUserPremium.mockResolvedValue({});
      mockIsActivePremium.mockReturnValue(true);
      configureStatefulSettingsMocks();
      prisma.chatMemory.findMany.mockResolvedValue([
        {
          content: "User likes batching newsletters in the afternoon.",
          createdAt: new Date("2026-03-15T08:00:00.000Z"),
        },
      ]);
      prisma.chatMemory.findFirst.mockResolvedValue(null);
      prisma.chatMemory.create.mockResolvedValue({});
    });

    describeEvalMatrix(
      "assistant-chat settings and memory",
      (model, emailAccount) => {
        for (const scenario of selectedScenarios) {
          test(
            scenario.title,
            async () => {
              configureSettingsScenarioState(scenario);

              const result = await runAssistantChat({
                emailAccount,
                messages: getScenarioMessages(scenario),
              });

              const { pass, judgeOutput, judgeResult } = await evaluateScenario(
                result,
                getScenarioPrompt(scenario),
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
  const trace = await captureAssistantChatTrace({
    messages,
    emailAccount,
    logger,
  });

  return {
    toolCalls: trace.toolCalls,
    finalText: trace.finalText,
    actual: summarizeRecordedToolCalls(trace.toolCalls, summarizeToolCall),
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

type UpdatePersonalInstructionsInput = {
  personalInstructions: string;
  mode?: "append" | "replace";
};

type ActivateToolsInput = {
  capabilities: string[];
};

type AddToKnowledgeBaseInput = {
  title: string;
  content: string;
};

function isUpdateAssistantSettingsInput(
  input: unknown,
): input is UpdateAssistantSettingsInput {
  if (!input || typeof input !== "object") return false;

  return Array.isArray((input as { changes?: unknown }).changes);
}

function isSaveMemoryInput(input: unknown): input is SaveMemoryInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    content?: unknown;
    source?: unknown;
    userEvidence?: unknown;
  };

  return (
    typeof value.content === "string" &&
    (value.source == null ||
      value.source === "user_message" ||
      value.source === "assistant_inference") &&
    (value.userEvidence == null || typeof value.userEvidence === "string")
  );
}

function isSearchMemoriesInput(input: unknown): input is SearchMemoriesInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { query?: unknown }).query === "string"
  );
}

function isUpdatePersonalInstructionsInput(
  input: unknown,
): input is UpdatePersonalInstructionsInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    personalInstructions?: unknown;
    mode?: unknown;
  };

  return (
    typeof value.personalInstructions === "string" &&
    (value.mode == null || value.mode === "append" || value.mode === "replace")
  );
}

function isActivateToolsInput(input: unknown): input is ActivateToolsInput {
  return (
    !!input &&
    typeof input === "object" &&
    Array.isArray((input as { capabilities?: unknown }).capabilities)
  );
}

function isAddToKnowledgeBaseInput(
  input: unknown,
): input is AddToKnowledgeBaseInput {
  if (!input || typeof input !== "object") return false;

  const value = input as { title?: unknown; content?: unknown };
  return typeof value.title === "string" && typeof value.content === "string";
}

async function evaluateScenario(
  result: Awaited<ReturnType<typeof runAssistantChat>>,
  prompt: string,
  expectation: SettingsMemoryScenarioExpectation,
) {
  switch (expectation.kind) {
    case "capability_discovery": {
      const judgeResult = expectation.semanticExpectation
        ? await judgeEvalOutput({
            input: prompt,
            output: result.finalText,
            expected: expectation.semanticExpectation,
            criterion: expectation.semanticCriterion ?? {
              name: "Capability explanation",
              description:
                "The assistant should accurately explain the supported capability and its limitations using the authoritative capability state.",
            },
          })
        : null;

      return {
        pass:
          result.toolCalls.some(
            (toolCall) => toolCall.toolName === "getAssistantCapabilities",
          ) &&
          hasNoToolCalls(result.toolCalls, [
            "updateAssistantSettings",
            ...(expectation.forbiddenTools ?? []),
          ]) &&
          (judgeResult?.pass ?? true),
        judgeOutput: judgeResult ? result.finalText : null,
        judgeResult,
      };
    }

    case "digest_explanation": {
      const judgeResult = await judgeEvalOutput({
        input: prompt,
        output: result.finalText,
        expected: expectation.semanticExpectation,
        criterion: {
          name: "Digest delivery explanation",
          description:
            "The answer must accurately use the authoritative digest capability state to identify the automatic recipient, combined-rule behavior, and realistic dispatch timing. It must not invent a missing destination or unsupported refund advice.",
        },
      });

      return {
        pass:
          result.toolCalls.some(
            (toolCall) => toolCall.toolName === "getAssistantCapabilities",
          ) &&
          hasNoToolCalls(result.toolCalls, ["updateAssistantSettings"]) &&
          judgeResult.pass,
        judgeOutput: result.finalText,
        judgeResult,
      };
    }

    case "assistant_settings": {
      return {
        pass:
          hasExpectedSettingsUpdate(result.toolCalls, expectation.changes) &&
          hasNoToolCalls(result.toolCalls, expectation.forbiddenTools),
        judgeOutput: null,
        judgeResult: null,
      };
    }

    case "personal_instructions": {
      const piCall = getLastMatchingToolCall(
        result.toolCalls,
        "updatePersonalInstructions",
        isUpdatePersonalInstructionsInput,
      )?.input;
      const piContent = piCall?.personalInstructions ?? null;
      const judgeResult = piContent
        ? await judgeEvalOutput({
            input: prompt,
            output: piContent,
            expected: expectation.semanticExpectation,
            criterion: {
              name: "Personal instructions semantics",
              description:
                "Judge only whether the stored personal-instructions text semantically preserves the requested preference. Tool execution is verified separately, so do not require the text itself to report or confirm that an update occurred. Wording, perspective, and sentence style may differ from the prompt.",
            },
          })
        : null;

      return {
        pass:
          !!piCall &&
          !!judgeResult?.pass &&
          (piCall.mode ?? "append") === expectation.mode,
        judgeOutput: piContent,
        judgeResult,
      };
    }

    case "knowledge_create": {
      const knowledgeCall = getLastMatchingToolCall(
        result.toolCalls,
        "addToKnowledgeBase",
        isAddToKnowledgeBaseInput,
      )?.input;
      const contentJudge = knowledgeCall
        ? await judgeEvalOutput({
            input: prompt,
            output: knowledgeCall.content,
            expected: expectation.content,
            criterion: {
              name: "Knowledge content semantics",
              description:
                "Judge only whether the new knowledge entry content preserves the requested drafting guidance. The tool execution and title are verified separately.",
            },
          })
        : null;

      return {
        pass:
          knowledgeCall?.title === expectation.title && !!contentJudge?.pass,
        judgeOutput: knowledgeCall?.content ?? null,
        judgeResult: contentJudge,
      };
    }

    case "save_memory": {
      const memoryCall = getLastMatchingToolCall(
        result.toolCalls,
        "saveMemory",
        isSaveMemoryInput,
      )?.input;
      const contentJudge = memoryCall
        ? await judgeEvalOutput({
            input: prompt,
            output: memoryCall.content,
            expected: expectation.expectedContent,
            criterion: {
              name: "Saved memory semantics",
              description:
                "The saved memory content should preserve the semantic meaning of the user's preference or fact. Both first-person ('I prefer...') and third-person ('The user prefers...') formats are acceptable. Do not penalize perspective differences.",
            },
          })
        : null;

      return {
        pass:
          !!memoryCall &&
          !!contentJudge?.pass &&
          hasNoToolCalls(result.toolCalls, expectation.forbiddenTools),
        judgeOutput: memoryCall
          ? JSON.stringify({
              content: memoryCall.content,
              source: memoryCall.source,
              userEvidence: memoryCall.userEvidence,
            })
          : null,
        judgeResult: contentJudge,
      };
    }

    case "search_memories": {
      return evaluateSearchMemoriesExpectation(result, prompt, expectation);
    }

    case "assistant_settings_and_save_memory": {
      const memoryCall = getLastMatchingToolCall(
        result.toolCalls,
        "saveMemory",
        isSaveMemoryInput,
      )?.input;
      const contentJudge = memoryCall
        ? await judgeEvalOutput({
            input: prompt,
            output: memoryCall.content,
            expected: expectation.expectedContent,
            criterion: {
              name: "Saved memory semantics",
              description:
                "The saved memory content should preserve the semantic meaning of the user's preference or fact. Both first-person and third-person formats are acceptable. Do not penalize perspective differences.",
            },
          })
        : null;

      return {
        pass:
          hasExpectedSettingsUpdate(result.toolCalls, expectation.changes) &&
          !!memoryCall &&
          !!contentJudge?.pass &&
          hasNoToolCalls(result.toolCalls, expectation.forbiddenTools),
        judgeOutput: memoryCall
          ? JSON.stringify({
              content: memoryCall.content,
              source: memoryCall.source,
              userEvidence: memoryCall.userEvidence,
            })
          : null,
        judgeResult: contentJudge,
      };
    }

    case "save_then_search_memories": {
      const firstSaveCall = getFirstMatchingToolCall(
        result.toolCalls,
        "saveMemory",
        isSaveMemoryInput,
      );
      const lastSearchCall = getLastMatchingToolCall(
        result.toolCalls,
        "searchMemories",
        isSearchMemoriesInput,
      );
      const contentJudge = firstSaveCall
        ? await judgeEvalOutput({
            input: prompt,
            output: firstSaveCall.input.content,
            expected: expectation.expectedContent,
            criterion: {
              name: "Saved memory semantics",
              description:
                "The saved memory content should preserve the semantic meaning of the user's preference or fact. Both first-person and third-person formats are acceptable. Do not penalize perspective differences.",
            },
          })
        : null;
      const searchEvaluation = lastSearchCall
        ? await evaluateSearchMemoriesExpectation(result, prompt, {
            kind: "search_memories",
            forbiddenTools: expectation.forbiddenTools,
            semanticExpectation: expectation.semanticExpectation,
            allowEmptyQuery: expectation.allowEmptyQuery,
            requireEmptyQuery: expectation.requireEmptyQuery,
          })
        : {
            pass: false,
            judgeOutput: null,
            judgeResult: null,
          };

      return {
        pass:
          !!firstSaveCall &&
          !!lastSearchCall &&
          firstSaveCall.index < lastSearchCall.index &&
          !!contentJudge?.pass &&
          searchEvaluation.pass,
        judgeOutput: firstSaveCall
          ? JSON.stringify({
              content: firstSaveCall.input.content,
              source: firstSaveCall.input.source,
              userEvidence: firstSaveCall.input.userEvidence,
            })
          : searchEvaluation.judgeOutput,
        judgeResult: contentJudge ?? searchEvaluation.judgeResult,
      };
    }
  }
}

function hasNoToolCalls(
  toolCalls: RecordedToolCall[],
  toolNames: string[] | undefined,
) {
  if (!toolNames?.length) return true;
  return !toolCalls.some((toolCall) => toolNames.includes(toolCall.toolName));
}

function hasExpectedSettingsUpdate(
  toolCalls: RecordedToolCall[],
  expectedChanges: AssistantSettingsChangeExpectation[],
) {
  const settingsCalls = toolCalls.flatMap((toolCall) =>
    toolCall.toolName === "updateAssistantSettings" &&
    isUpdateAssistantSettingsInput(toolCall.input)
      ? [toolCall.input]
      : [],
  );
  const matchingCallIndex = settingsCalls.findLastIndex((settingsCall) =>
    matchesExpectedChanges(settingsCall.changes, expectedChanges),
  );
  if (matchingCallIndex < 0) return false;

  return settingsCalls.slice(matchingCallIndex + 1).every((settingsCall) =>
    settingsCall.changes.every((actualChange) => {
      const expectedChange = expectedChanges.find(
        (candidate) => candidate.path === actualChange.path,
      );
      return (
        !expectedChange || matchesExpectedChange(actualChange, expectedChange)
      );
    }),
  );
}

function configureSettingsScenarioState(scenario: SettingsMemoryScenario) {
  switch (scenario.id) {
    case "batched-briefs-and-filing":
      accountSnapshot.meetingBriefingsEnabled = false;
      accountSnapshot.filingEnabled = false;
      break;
    case "followup-refine-meeting-briefs":
      accountSnapshot.meetingBriefingsMinutesBefore = 240;
      accountSnapshot.meetingBriefsSendEmail = false;
      break;
    case "enable-filing-and-set-prompt":
      accountSnapshot.filingEnabled = false;
      accountSnapshot.filingPrompt = null;
      break;
    case "disable-filing-and-clear-prompt":
    case "clear-filing-prompt-only":
      accountSnapshot.filingEnabled = true;
      accountSnapshot.filingPrompt = "File attachments by project.";
      break;
    case "scheduled-checkins-enable-after-capabilities":
      accountSnapshot.automationJob.enabled = false;
      break;
  }
}

function configureStatefulSettingsMocks() {
  accountSnapshot = structuredClone(baseAccountSnapshot);

  prisma.emailAccount.findUnique.mockImplementation(
    async () => accountSnapshot,
  );
  prisma.emailAccount.update.mockImplementation(async ({ data }) => {
    Object.assign(accountSnapshot, data);
    return accountSnapshot;
  });
  prisma.automationJob.findUnique.mockImplementation(
    async () => accountSnapshot.automationJob,
  );
  prisma.digestItem.count.mockResolvedValue(2);
  prisma.digest.findFirst.mockResolvedValue({
    status: "SENT",
    sentAt: new Date("2026-02-20T09:05:00.000Z"),
    updatedAt: new Date("2026-02-20T09:05:00.000Z"),
  } as never);
  prisma.automationJob.update.mockImplementation(async ({ data }) => {
    Object.assign(accountSnapshot.automationJob, data);
    return accountSnapshot.automationJob;
  });
  prisma.messagingChannel.findUnique.mockImplementation(async () => ({
    ...accountSnapshot.messagingChannels[0],
    routes: [],
  }));
  prisma.messagingRoute.create.mockResolvedValue({});
  prisma.knowledge.create.mockImplementation(async ({ data }) => {
    accountSnapshot.knowledge.push({
      id: `knowledge-${accountSnapshot.knowledge.length + 1}`,
      title: data.title,
      content: data.content,
      updatedAt: new Date("2026-02-21T08:00:00.000Z"),
    });
    return {};
  });
  prisma.knowledge.update.mockImplementation(async ({ where, data }) => {
    const existing = accountSnapshot.knowledge.find(
      (item) => item.title === where.emailAccountId_title?.title,
    );
    if (!existing) throw new Error("Knowledge item not found");

    Object.assign(existing, data, {
      updatedAt: new Date("2026-02-21T08:00:00.000Z"),
    });
    return existing;
  });
  prisma.knowledge.deleteMany.mockImplementation(async ({ where }) => {
    accountSnapshot.knowledge = accountSnapshot.knowledge.filter(
      (item) => item.title !== where.title,
    );
    return { count: 1 };
  });
}

function getScenarioMessages(scenario: SettingsMemoryScenario): ModelMessage[] {
  if (scenario.messages) return scenario.messages;
  return [{ role: "user", content: scenario.prompt ?? "" }];
}

function getScenarioPrompt(scenario: SettingsMemoryScenario): string {
  if (scenario.prompt) return scenario.prompt;

  const lastUserMessage = [...(scenario.messages ?? [])]
    .reverse()
    .find((message) => message.role === "user");

  if (lastUserMessage && typeof lastUserMessage.content === "string") {
    return lastUserMessage.content;
  }

  return "";
}

function matchesExpectedChanges(
  actualChanges: UpdateAssistantSettingsInput["changes"],
  expectedChanges: AssistantSettingsChangeExpectation[],
) {
  return expectedChanges.every((expectedChange) =>
    actualChanges.some((actualChange) =>
      matchesExpectedChange(actualChange, expectedChange),
    ),
  );
}

function matchesExpectedChange(
  actualChange: UpdateAssistantSettingsInput["changes"][number],
  expectedChange: AssistantSettingsChangeExpectation,
) {
  return (
    actualChange.path === expectedChange.path &&
    isDeepStrictEqual(actualChange.value, expectedChange.value) &&
    (expectedChange.mode == null || actualChange.mode === expectedChange.mode)
  );
}

async function evaluateSearchMemoriesExpectation(
  result: Awaited<ReturnType<typeof runAssistantChat>>,
  prompt: string,
  expectation: Extract<
    SettingsMemoryScenarioExpectation,
    { kind: "search_memories" }
  >,
) {
  const searchCall = getLastMatchingToolCall(
    result.toolCalls,
    "searchMemories",
    isSearchMemoriesInput,
  )?.input;
  const trimmedQuery = searchCall?.query.trim() ?? "";

  if (!searchCall) {
    return {
      pass: false,
      judgeOutput: null,
      judgeResult: null,
    };
  }

  if (expectation.requireEmptyQuery) {
    return {
      pass:
        trimmedQuery.length === 0 &&
        hasNoToolCalls(result.toolCalls, expectation.forbiddenTools),
      judgeOutput: searchCall.query,
      judgeResult: {
        pass: trimmedQuery.length === 0,
        reasoning: "Broad recall requires an empty searchMemories query.",
      },
    };
  }

  if (trimmedQuery.length === 0 && expectation.allowEmptyQuery) {
    return {
      pass: hasNoToolCalls(result.toolCalls, expectation.forbiddenTools),
      judgeOutput: searchCall.query,
      judgeResult: {
        pass: true,
        reasoning: "Empty query is allowed for broad memory recall.",
      },
    };
  }

  const judgeResult = expectation.semanticExpectation
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
    : {
        pass: trimmedQuery.length > 0,
        reasoning: "Search query should not be empty for a topical lookup.",
      };

  return {
    pass:
      !!judgeResult?.pass &&
      hasNoToolCalls(result.toolCalls, expectation.forbiddenTools),
    judgeOutput: searchCall.query,
    judgeResult,
  };
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (toolCall.toolName === "getAssistantCapabilities") {
    return "getAssistantCapabilities()";
  }

  if (isActivateToolsInput(toolCall.input)) {
    return `activateTools([${toolCall.input.capabilities.join(", ")}])`;
  }

  if (isUpdateAssistantSettingsInput(toolCall.input)) {
    const changes = toolCall.input.changes
      .map((change) => {
        const mode = change.mode ? `,mode=${change.mode}` : "";
        return `${change.path}=${JSON.stringify(change.value)}${mode}`;
      })
      .join("; ");
    return `${toolCall.toolName}(changes=[${changes}])`;
  }

  if (isSaveMemoryInput(toolCall.input)) {
    return `${toolCall.toolName}(${toolCall.input.content})`;
  }

  if (isSearchMemoriesInput(toolCall.input)) {
    return `${toolCall.toolName}(${toolCall.input.query})`;
  }

  if (isUpdatePersonalInstructionsInput(toolCall.input)) {
    return `${toolCall.toolName}(mode=${toolCall.input.mode ?? "append"})`;
  }

  if (isAddToKnowledgeBaseInput(toolCall.input)) {
    return `${toolCall.toolName}(title=${JSON.stringify(toolCall.input.title)}, content=${JSON.stringify(toolCall.input.content)})`;
  }

  return toolCall.toolName;
}
