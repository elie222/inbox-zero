import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatTrace,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getMockMessage } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { getEmailAccount } from "@/__tests__/helpers";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-microsoft-search-feedback.test.ts
// Multi-model: EVAL_MODELS=all pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-microsoft-search-feedback.test.ts

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 120_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger(
  "eval-assistant-chat-microsoft-search-feedback",
);
const senderEmail = "alerts@sitebuilder.example";
const successfulMessage = getMockMessage({
  id: "msg-microsoft-feedback-1",
  threadId: "thread-microsoft-feedback-1",
  from: senderEmail,
  subject: "Weekly site report",
  snippet: "Traffic highlights and plugin notices.",
  labelIds: ["UNREAD"],
});

const {
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockSearchMessages,
  mockGetMessage,
} = vi.hoisted(() => ({
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
  mockSearchMessages: vi.fn(),
  mockGetMessage: vi.fn(),
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

vi.mock("@/utils/prisma");

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

describe.runIf(shouldRunEval)(
  "Eval: assistant chat microsoft search feedback retry",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      prisma.emailAccount.findUnique.mockImplementation(async ({ select }) => {
        if (select?.email) {
          return {
            email: "user@test.com",
            timezone: "America/Los_Angeles",
            meetingBriefingsEnabled: false,
            meetingBriefingsMinutesBefore: 15,
            meetingBriefsSendEmail: false,
            filingEnabled: false,
            filingPrompt: null,
            filingFolders: [],
            driveConnections: [],
          };
        }

        return {
          about: "Keep replies concise and direct.",
          rules: [],
        };
      });

      mockGetMessage.mockResolvedValue(successfulMessage);

      mockSearchMessages.mockImplementation(async ({ query }) => {
        const normalized = query.trim();
        if (normalized === senderEmail || normalized === `"${senderEmail}"`) {
          return {
            messages: [successfulMessage],
            nextPageToken: undefined,
          };
        }

        throw Object.assign(new Error("Unsupported search clause"), {
          statusCode: 400,
          code: "BadRequest",
        });
      });

      mockCreateEmailProvider.mockResolvedValue({
        searchMessages: mockSearchMessages,
        getLabels: vi.fn().mockResolvedValue([]),
        getMessage: mockGetMessage,
        getMessagesWithPagination: vi.fn().mockResolvedValue({
          messages: [],
          nextPageToken: undefined,
        }),
      });
    });

    describeEvalMatrix(
      "assistant-chat microsoft search feedback retry",
      (model, emailAccount) => {
        test(
          "retries with a simpler query after microsoft search feedback",
          async () => {
            const trace = await runAssistantChat({
              emailAccount: withMicrosoftProvider(emailAccount),
              messages: [
                {
                  role: "user",
                  content:
                    "Find the unread email from alerts@sitebuilder.example received after April 20 about the weekly site report.",
                },
              ],
            });

            const searchResults = getSearchInboxResults(trace);
            const firstSuccessfulSearch = searchResults.find(
              (result) =>
                Array.isArray(result.output.messages) &&
                result.output.messages.length > 0,
            );
            const firstFailedSearch = searchResults.find(
              (result) =>
                result.output.error && result.output.microsoftSearchFeedback,
            );
            const successfulRetry = firstFailedSearch
              ? searchResults.find(
                  (result, index) =>
                    index > searchResults.indexOf(firstFailedSearch) &&
                    Array.isArray(result.output.messages) &&
                    result.output.messages.length > 0,
                )
              : null;

            const firstFailedQuery = firstFailedSearch?.input.query ?? null;
            const retryQuery = successfulRetry?.input.query ?? null;
            const feedback = firstFailedSearch?.output.microsoftSearchFeedback;
            const directSuccessQuery =
              !firstFailedSearch && firstSuccessfulSearch
                ? firstSuccessfulSearch.input.query
                : null;
            const retryJudgeResult =
              firstFailedQuery && retryQuery && feedback
                ? await judgeEvalOutput({
                    input: buildRetryJudgeInput({
                      firstFailedQuery,
                      feedback,
                    }),
                    output: retryQuery,
                    expected:
                      "A materially simpler Outlook retry query that follows the failure feedback and does not repeat the same broken query shape.",
                    criterion: {
                      name: "Reasonable Outlook retry",
                      description:
                        "The retry query should be materially simpler than the failed query, consistent with the Microsoft search feedback, and a reasonable Outlook retry. It does not need to match any exact string or use a specific field.",
                    },
                  })
                : null;
            const directSuccessJudgeResult = directSuccessQuery
              ? await judgeEvalOutput({
                  input:
                    "The assistant is searching a Microsoft inbox. Judge whether this search query is a simple, reasonable Outlook query for the user request rather than an over-complex multi-clause query.",
                  output: directSuccessQuery,
                  expected:
                    "A simple Outlook query that is likely to succeed directly without needing fallback feedback.",
                  criterion: {
                    name: "Reasonable direct Outlook query",
                    description:
                      "The query should be a simple Outlook search query that directly targets the user request without unnecessary complexity or unsupported combinations.",
                  },
                })
              : null;

            const passViaRetry =
              !!firstFailedQuery &&
              !!retryQuery &&
              isRetryCandidateNeedingSimplification(firstFailedQuery) &&
              feedback?.failureType === "query_failed" &&
              feedback.attempts.length >= 2 &&
              firstFailedQuery !== retryQuery &&
              feedback.attempts.every(
                (attempt) =>
                  normalizeQuery(attempt.query) !== normalizeQuery(retryQuery),
              ) &&
              successfulRetry?.output.messages?.[0]?.messageId ===
                successfulMessage.id &&
              retryJudgeResult?.pass === true;

            const passViaDirectSuccess =
              !!directSuccessQuery &&
              searchResults.length === 1 &&
              firstSuccessfulSearch?.output.messages?.[0]?.messageId ===
                successfulMessage.id &&
              directSuccessJudgeResult?.pass === true;

            const pass =
              (passViaRetry || passViaDirectSuccess) &&
              !hasWriteToolCalls(trace.toolCalls);

            evalReporter.record({
              testName:
                "microsoft search uses a simple direct query or a feedback-guided retry",
              model: model.label,
              pass,
              actual:
                passViaRetry && retryQuery
                  ? formatSemanticJudgeActual(
                      [
                        summarizeToolCalls(trace.toolCalls),
                        firstFailedQuery
                          ? `firstQuery=${JSON.stringify(firstFailedQuery)}`
                          : null,
                        retryQuery
                          ? `retryQuery=${JSON.stringify(retryQuery)}`
                          : null,
                        feedback
                          ? `feedback=${JSON.stringify({
                              failureType: feedback.failureType,
                              attempts: feedback.attempts.map(
                                (attempt) => attempt.query,
                              ),
                              retryQueries: feedback.retryQueries,
                              removedTerms: feedback.removedTerms,
                            })}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" | "),
                      retryJudgeResult ?? {
                        pass: false,
                        reasoning: "retry judge did not run",
                      },
                    )
                  : passViaDirectSuccess && directSuccessQuery
                    ? formatSemanticJudgeActual(
                        [
                          summarizeToolCalls(trace.toolCalls),
                          `directQuery=${JSON.stringify(directSuccessQuery)}`,
                        ].join(" | "),
                        directSuccessJudgeResult ?? {
                          pass: false,
                          reasoning: "direct success judge did not run",
                        },
                      )
                    : "no valid Microsoft search path observed",
              criteria: [
                ...(retryJudgeResult ? [retryJudgeResult] : []),
                ...(directSuccessJudgeResult ? [directSuccessJudgeResult] : []),
              ],
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
  return captureAssistantChatTrace({
    messages,
    emailAccount,
    logger,
  });
}

type SearchInboxInput = {
  query: string;
  limit?: number;
  pageToken?: string | null;
};

type SearchInboxOutput = {
  error?: string;
  messages?: Array<{
    messageId: string;
  }>;
  microsoftSearchFeedback?: {
    failureType?: string;
    removedTerms?: string[];
    retryQueries?: string[];
    attempts: Array<{
      query: string;
    }>;
  };
};

type SearchInboxResult = {
  input: SearchInboxInput;
  output: SearchInboxOutput;
};

function withMicrosoftProvider(
  emailAccount: ReturnType<typeof getEmailAccount>,
) {
  return {
    ...emailAccount,
    account: {
      ...emailAccount.account,
      provider: "microsoft" as const,
    },
  };
}

function getSearchInboxResults(
  trace: Awaited<ReturnType<typeof runAssistantChat>>,
): SearchInboxResult[] {
  const results: SearchInboxResult[] = [];

  for (const step of trace.steps) {
    if (!isRecord(step) || !Array.isArray(step.toolResults)) continue;

    for (const result of step.toolResults) {
      if (!isSearchInboxToolResult(result)) continue;
      results.push({
        input: result.input,
        output: result.output,
      });
    }
  }

  return results;
}

function isSearchInboxToolResult(value: unknown): value is {
  toolName: "searchInbox";
  input: SearchInboxInput;
  output: SearchInboxOutput;
} {
  if (!isRecord(value)) return false;

  return (
    value.type === "tool-result" &&
    value.toolName === "searchInbox" &&
    isSearchInboxInput(value.input) &&
    isSearchInboxOutput(value.output)
  );
}

function isSearchInboxInput(value: unknown): value is SearchInboxInput {
  return (
    isRecord(value) &&
    typeof value.query === "string" &&
    (value.limit === undefined || typeof value.limit === "number") &&
    (value.pageToken === undefined ||
      value.pageToken === null ||
      typeof value.pageToken === "string")
  );
}

function isSearchInboxOutput(value: unknown): value is SearchInboxOutput {
  if (!isRecord(value)) return false;

  const feedback = value.microsoftSearchFeedback;

  return (
    (value.error === undefined || typeof value.error === "string") &&
    (value.messages === undefined || Array.isArray(value.messages)) &&
    (feedback === undefined ||
      (isRecord(feedback) &&
        Array.isArray(feedback.attempts) &&
        (feedback.removedTerms === undefined ||
          (Array.isArray(feedback.removedTerms) &&
            feedback.removedTerms.every((term) => typeof term === "string"))) &&
        (feedback.retryQueries === undefined ||
          (Array.isArray(feedback.retryQueries) &&
            feedback.retryQueries.every(
              (query) => typeof query === "string",
            ))) &&
        feedback.attempts.every(
          (attempt) => isRecord(attempt) && typeof attempt.query === "string",
        )))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRetryCandidateNeedingSimplification(query: string) {
  const hasMultipleClauses = query.trim().split(/\s+/).length > 1;
  return (
    query.includes(senderEmail) &&
    hasMultipleClauses &&
    (/\bunread\b/i.test(query) ||
      /\bsubject:/i.test(query) ||
      /from:/i.test(query) ||
      />=|<=|>|</.test(query))
  );
}

function hasWriteToolCalls(toolCalls: RecordedToolCall[]) {
  const writeToolNames = new Set([
    "manageInbox",
    "createRule",
    "updateRuleConditions",
    "updateRuleActions",
    "updateLearnedPatterns",
    "updatePersonalInstructions",
    "updateAssistantSettings",
    "updateAssistantSettingsCompat",
    "sendEmail",
    "replyEmail",
    "forwardEmail",
    "saveMemory",
    "addToKnowledgeBase",
  ]);

  return toolCalls.some((toolCall) => writeToolNames.has(toolCall.toolName));
}

function summarizeToolCalls(toolCalls: RecordedToolCall[]) {
  return toolCalls.length > 0
    ? toolCalls
        .map(
          (toolCall) =>
            `${toolCall.toolName}:${JSON.stringify(toolCall.input)}`,
        )
        .join(" | ")
    : "no tool calls";
}

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildRetryJudgeInput({
  firstFailedQuery,
  feedback,
}: {
  firstFailedQuery: string;
  feedback: NonNullable<SearchInboxOutput["microsoftSearchFeedback"]>;
}) {
  return [
    "The assistant is retrying a Microsoft inbox search after a failed tool call.",
    `Failed query: ${firstFailedQuery}`,
    `Failure type: ${feedback.failureType ?? "unknown"}`,
    `Attempted queries: ${feedback.attempts.map((attempt) => attempt.query).join(" | ")}`,
    feedback.retryQueries?.length
      ? `Suggested retry queries: ${feedback.retryQueries.join(" | ")}`
      : null,
    feedback.removedTerms?.length
      ? `Terms to avoid reusing immediately: ${feedback.removedTerms.join(" | ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}
