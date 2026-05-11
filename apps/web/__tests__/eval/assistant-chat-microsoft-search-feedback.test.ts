import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  captureAssistantChatTrace,
  getFirstMatchingToolCall,
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
import { DraftEmailStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { getEmailAccount } from "@/__tests__/helpers";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-microsoft-search-feedback.test.ts
// Multi-model: EVAL_MODELS=all pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-microsoft-search-feedback.test.ts

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
      prisma.executedRule.findMany.mockResolvedValue([]);

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

        test(
          "does not hallucinate a found email or draft after microsoft search failure",
          async () => {
            mockSearchMessages.mockRejectedValue(
              Object.assign(new Error("Unsupported search clause"), {
                statusCode: 400,
                code: "BadRequest",
              }),
            );

            const trace = await runAssistantChat({
              emailAccount: withMicrosoftProvider(emailAccount),
              messages: [
                {
                  role: "user",
                  content:
                    "Why didn't you draft a reply to the email from updates@status.example about the weekly status report?",
                },
              ],
            });

            const searchResults = getSearchInboxResults(trace);
            const assistantText = getAssistantText(trace);
            const failedSearch = searchResults.find(
              (result) =>
                result.output.error &&
                result.output.microsoftSearchFeedback?.failureType ===
                  "query_failed",
            );
            const lookedUpRules = trace.toolCalls.some(
              (toolCall) => toolCall.toolName === "getUserRulesAndSettings",
            );
            const assistantJudge = assistantText
              ? await judgeEvalOutput({
                  input: [
                    "A user asked why a reply draft was not generated for a specific email.",
                    "The assistant attempted to search a Microsoft inbox, and every search attempt failed.",
                    lookedUpRules
                      ? "The assistant also checked the account rule settings and found no active rules configured."
                      : "The assistant did not retrieve any rule configuration details.",
                    failedSearch?.output.microsoftSearchFeedback
                      ? `Tool feedback: ${JSON.stringify({
                          failureType:
                            failedSearch.output.microsoftSearchFeedback
                              .failureType,
                          attempts:
                            failedSearch.output.microsoftSearchFeedback.attempts.map(
                              (attempt) => attempt.query,
                            ),
                          retryQueries:
                            failedSearch.output.microsoftSearchFeedback
                              .retryQueries,
                        })}`
                      : "Tool feedback: none",
                  ].join("\n"),
                  output: assistantText,
                  expected:
                    "A response that clearly says the assistant could not verify the specific email because inbox search failed, does not claim it found the email or prepared a draft, and treats any explanation as a general possibility rather than a confirmed fact. If it explicitly checked the account rules and found none, it may say that no active rules are configured.",
                  criterion: {
                    name: "No hallucinated email lookup after search failure",
                    description:
                      "When inbox search fails, the assistant must not claim it found the message, knows the message contents, knows which rule applied, or already prepared a draft. It should acknowledge the failed lookup and keep any email-specific explanation explicitly unverified. Claims that are directly supported by separate tool results, such as explicitly checking account rules and finding none, are allowed.",
                  },
                })
              : null;

            const pass =
              !!failedSearch &&
              searchResults.length >= 1 &&
              searchResults.every(
                (result) =>
                  result.output.error === "Failed to search inbox" &&
                  !result.output.messages?.length,
              ) &&
              !hasLookupDependentToolCalls(trace.toolCalls) &&
              !hasWriteToolCalls(trace.toolCalls) &&
              !!assistantJudge?.pass;

            evalReporter.record({
              testName:
                "microsoft search failure does not hallucinate a found email or draft",
              model: model.label,
              pass,
              actual: [
                summarizeToolCalls(trace.toolCalls),
                failedSearch?.output.microsoftSearchFeedback
                  ? `feedback=${JSON.stringify({
                      failureType:
                        failedSearch.output.microsoftSearchFeedback.failureType,
                      attempts:
                        failedSearch.output.microsoftSearchFeedback.attempts.map(
                          (attempt) => attempt.query,
                        ),
                      retryQueries:
                        failedSearch.output.microsoftSearchFeedback
                          .retryQueries,
                    })}`
                  : null,
                assistantJudge && assistantText
                  ? formatSemanticJudgeActual(assistantText, assistantJudge)
                  : assistantText
                    ? `assistant=${JSON.stringify(assistantText)}`
                    : "no assistant text",
              ]
                .filter(Boolean)
                .join(" | "),
              criteria: assistantJudge ? [assistantJudge] : [],
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "searches, loads executed rule details, and explains why no draft was generated",
          async () => {
            const explanationMessage = getMockMessage({
              id: "msg-microsoft-feedback-2",
              threadId: "thread-microsoft-feedback-2",
              from: "updates@status.example",
              subject: "Weekly status report",
              snippet: "Status update and rollout summary.",
              labelIds: ["UNREAD"],
            });

            mockGetMessage.mockResolvedValue(explanationMessage);
            mockSearchMessages.mockImplementation(async ({ query }) => {
              const normalized = query.trim().toLowerCase();
              if (
                normalized.includes("updates@status.example") ||
                normalized.includes("weekly status report")
              ) {
                return {
                  messages: [explanationMessage],
                  nextPageToken: undefined,
                };
              }

              return {
                messages: [],
                nextPageToken: undefined,
              };
            });
            prisma.executedRule.findMany.mockResolvedValue([
              {
                id: "executed-rule-why-no-draft-1",
                ruleId: "rule-fyi-updates",
                threadId: explanationMessage.threadId,
                createdAt: new Date("2026-04-20T10:00:00.000Z"),
                status: "APPLIED",
                reason:
                  'Matched the "FYI Updates" rule, which files status updates for review and does not prepare a reply draft.',
                matchMetadata: [{ type: "STATIC" }],
                automated: true,
                actionItems: [],
                rule: {
                  id: "rule-fyi-updates",
                  name: "FYI Updates",
                },
              },
            ]);

            const trace = await runAssistantChat({
              emailAccount: withMicrosoftProvider(emailAccount),
              messages: [
                {
                  role: "user",
                  content:
                    "Why didn't you draft a reply to the email from updates@status.example about the weekly status report?",
                },
              ],
            });

            const searchResults = getSearchInboxResults(trace);
            const firstSuccessfulSearch = searchResults.find(
              (result) =>
                Array.isArray(result.output.messages) &&
                result.output.messages.some(
                  (message) => message.messageId === explanationMessage.id,
                ),
            );
            const executionCall = getFirstMatchingToolCall(
              trace.toolCalls,
              "getRuleExecutionForMessage",
              isGetRuleExecutionInput,
            );
            const assistantText = getAssistantText(trace);
            const explanationJudge = assistantText
              ? await judgeEvalOutput({
                  input: [
                    "The user asked why a reply draft was not generated for a specific email.",
                    "The assistant successfully found the email and then loaded the exact executed rule history for that message.",
                    'Retrieved execution: ruleName="FYI Updates"; reason="Matched the FYI Updates rule, which files status updates for review and does not prepare a reply draft."',
                  ].join("\n"),
                  output: assistantText,
                  expected:
                    'A concise explanation that says the email matched the "FYI Updates" rule and that this rule does not prepare a reply draft, without inventing extra unsupported causes.',
                  criterion: {
                    name: "Grounded explanation from exact rule execution",
                    description:
                      "After finding the message and reading its exact rule execution, the assistant should explain the no-draft outcome using that retrieved evidence. It should connect the matched rule to the absence of a draft and avoid unsupported speculation.",
                  },
                })
              : null;

            const pass =
              !!firstSuccessfulSearch &&
              !!executionCall &&
              executionCall.input.messageId === explanationMessage.id &&
              !hasWriteToolCalls(trace.toolCalls) &&
              !!explanationJudge?.pass &&
              prisma.executedRule.findMany.mock.calls.some(
                ([args]) =>
                  args?.where?.messageId === explanationMessage.id &&
                  args?.where?.emailAccountId === emailAccount.id,
              );

            evalReporter.record({
              testName:
                "search finds email and exact rule execution explains no draft",
              model: model.label,
              pass,
              actual: [
                summarizeToolCalls(trace.toolCalls),
                assistantText && explanationJudge
                  ? formatSemanticJudgeActual(assistantText, explanationJudge)
                  : assistantText
                    ? `assistant=${JSON.stringify(assistantText)}`
                    : "no assistant text",
              ].join(" | "),
              criteria: explanationJudge ? [explanationJudge] : [],
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "searches, loads executed rule details, and explains why a draft was prepared",
          async () => {
            const explanationMessage = getMockMessage({
              id: "msg-microsoft-feedback-3",
              threadId: "thread-microsoft-feedback-3",
              from: "requests@customer.example",
              subject: "Question about the contract terms",
              snippet: "Can you clarify the next step for approval?",
              labelIds: ["UNREAD", "Label_To Reply"],
            });

            mockGetMessage.mockResolvedValue(explanationMessage);
            mockSearchMessages.mockImplementation(async ({ query }) => {
              const normalized = query.trim().toLowerCase();
              if (
                normalized.includes("requests@customer.example") ||
                normalized.includes("contract") ||
                normalized.includes("approval")
              ) {
                return {
                  messages: [explanationMessage],
                  nextPageToken: undefined,
                };
              }

              return {
                messages: [],
                nextPageToken: undefined,
              };
            });
            prisma.executedRule.findMany.mockResolvedValue([
              {
                id: "executed-rule-draft-expected-1",
                ruleId: "rule-customer-requests",
                threadId: explanationMessage.threadId,
                createdAt: new Date("2026-04-20T11:00:00.000Z"),
                status: "APPLIED",
                reason:
                  'Matched the "Customer Requests" rule, which prepares a reply draft for direct customer questions that need a response.',
                matchMetadata: [{ type: "AI" }],
                automated: true,
                actionItems: [
                  {
                    type: "DRAFT_EMAIL",
                    label: null,
                    labelId: null,
                    subject: "Re: Question about the contract terms",
                    to: "requests@customer.example",
                    cc: null,
                    bcc: null,
                    url: null,
                    folderName: null,
                    draftId: "draft-contract-terms-1",
                    draftStatus: DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
                  },
                ],
                rule: {
                  id: "rule-customer-requests",
                  name: "Customer Requests",
                },
              },
            ]);

            const trace = await runAssistantChat({
              emailAccount: withMicrosoftProvider(emailAccount),
              messages: [
                {
                  role: "user",
                  content:
                    "Why did you draft a reply to the email from requests@customer.example about the contract terms?",
                },
              ],
            });

            const searchResults = getSearchInboxResults(trace);
            const firstSuccessfulSearch = searchResults.find(
              (result) =>
                Array.isArray(result.output.messages) &&
                result.output.messages.some(
                  (message) => message.messageId === explanationMessage.id,
                ),
            );
            const searchCall = getFirstMatchingToolCall(
              trace.toolCalls,
              "searchInbox",
              isSearchInboxInput,
            );
            const executionCall = getFirstMatchingToolCall(
              trace.toolCalls,
              "getRuleExecutionForMessage",
              isGetRuleExecutionInput,
            );
            const assistantText = getAssistantText(trace);
            const explanationJudge = assistantText
              ? await judgeEvalOutput({
                  input: [
                    "The user asked why a reply draft was prepared for a specific email.",
                    "The assistant successfully found the email and then loaded the exact executed rule history for that message.",
                    'Retrieved execution: ruleName="Customer Requests"; reason="Matched the Customer Requests rule, which prepares a reply draft for direct customer questions that need a response."',
                  ].join("\n"),
                  output: assistantText,
                  expected:
                    'A concise explanation that says the email matched the "Customer Requests" rule and that this rule prepares reply drafts for messages like this.',
                  criterion: {
                    name: "Grounded explanation for expected draft",
                    description:
                      "After finding the message and reading its exact rule execution, the assistant should explain that a draft was prepared because the matched rule is intended to draft replies for this type of message.",
                  },
                })
              : null;

            const pass =
              !!firstSuccessfulSearch &&
              !!searchCall &&
              !!executionCall &&
              searchCall.index < executionCall.index &&
              executionCall.input.messageId === explanationMessage.id &&
              !hasWriteToolCalls(trace.toolCalls) &&
              !!explanationJudge?.pass &&
              prisma.executedRule.findMany.mock.calls.some(
                ([args]) =>
                  args?.where?.messageId === explanationMessage.id &&
                  args?.where?.emailAccountId === emailAccount.id,
              );

            evalReporter.record({
              testName:
                "search finds email and exact rule execution explains expected draft",
              model: model.label,
              pass,
              actual: [
                summarizeToolCalls(trace.toolCalls),
                assistantText && explanationJudge
                  ? formatSemanticJudgeActual(assistantText, explanationJudge)
                  : assistantText
                    ? `assistant=${JSON.stringify(assistantText)}`
                    : "no assistant text",
              ].join(" | "),
              criteria: explanationJudge ? [explanationJudge] : [],
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "notes the mismatch when history says a draft should have happened but the user says none appeared",
          async () => {
            const explanationMessage = getMockMessage({
              id: "msg-microsoft-feedback-4",
              threadId: "thread-microsoft-feedback-4",
              from: "requests@customer.example",
              subject: "Question about the renewal quote",
              snippet: "Can you confirm the pricing and renewal timing?",
              labelIds: ["UNREAD", "Label_To Reply"],
            });

            mockGetMessage.mockResolvedValue(explanationMessage);
            mockSearchMessages.mockImplementation(async ({ query }) => {
              const normalized = query.trim().toLowerCase();
              if (
                normalized.includes("requests@customer.example") ||
                normalized.includes("renewal") ||
                normalized.includes("pricing")
              ) {
                return {
                  messages: [explanationMessage],
                  nextPageToken: undefined,
                };
              }

              return {
                messages: [],
                nextPageToken: undefined,
              };
            });
            prisma.executedRule.findMany.mockResolvedValue([
              {
                id: "executed-rule-draft-mismatch-1",
                ruleId: "rule-customer-requests",
                threadId: explanationMessage.threadId,
                createdAt: new Date("2026-04-20T12:00:00.000Z"),
                status: "APPLIED",
                reason:
                  'Matched the "Customer Requests" rule and prepared a reply draft for follow-up.',
                matchMetadata: [{ type: "AI" }],
                automated: true,
                actionItems: [
                  {
                    type: "DRAFT_EMAIL",
                    label: null,
                    labelId: null,
                    subject: "Re: Question about the renewal quote",
                    to: "requests@customer.example",
                    cc: null,
                    bcc: null,
                    url: null,
                    folderName: null,
                    draftId: "draft-renewal-quote-1",
                    draftStatus: DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
                  },
                ],
                rule: {
                  id: "rule-customer-requests",
                  name: "Customer Requests",
                },
              },
            ]);

            const trace = await runAssistantChat({
              emailAccount: withMicrosoftProvider(emailAccount),
              messages: [
                {
                  role: "user",
                  content:
                    "Why didn't you draft a reply to the email from requests@customer.example about the renewal quote?",
                },
              ],
            });

            const searchResults = getSearchInboxResults(trace);
            const firstSuccessfulSearch = searchResults.find(
              (result) =>
                Array.isArray(result.output.messages) &&
                result.output.messages.some(
                  (message) => message.messageId === explanationMessage.id,
                ),
            );
            const searchCall = getFirstMatchingToolCall(
              trace.toolCalls,
              "searchInbox",
              isSearchInboxInput,
            );
            const executionCall = getFirstMatchingToolCall(
              trace.toolCalls,
              "getRuleExecutionForMessage",
              isGetRuleExecutionInput,
            );
            const assistantText = getAssistantText(trace);
            const mismatchJudge = assistantText
              ? await judgeEvalOutput({
                  input: [
                    "The user says no reply draft appeared for a specific email.",
                    "The assistant found the email and loaded the exact executed rule history for that message.",
                    'Retrieved execution: ruleName="Customer Requests"; reason="Matched the Customer Requests rule and prepared a reply draft for follow-up."',
                  ].join("\n"),
                  output: assistantText,
                  expected:
                    "A response that explicitly notes the mismatch: the recorded execution says a draft should have been prepared, so the user's report does not line up with the retrieved history. It may suggest an automation or delivery issue, but should avoid pretending to know the root cause for certain.",
                  criterion: {
                    name: "Detects mismatch when expected draft is missing",
                    description:
                      "When the user's reported outcome conflicts with the retrieved execution history, the assistant should call out that mismatch clearly instead of forcing the evidence into a wrong explanation.",
                  },
                })
              : null;

            const pass =
              !!firstSuccessfulSearch &&
              !!searchCall &&
              !!executionCall &&
              searchCall.index < executionCall.index &&
              executionCall.input.messageId === explanationMessage.id &&
              !hasWriteToolCalls(trace.toolCalls) &&
              !!mismatchJudge?.pass &&
              prisma.executedRule.findMany.mock.calls.some(
                ([args]) =>
                  args?.where?.messageId === explanationMessage.id &&
                  args?.where?.emailAccountId === emailAccount.id,
              );

            evalReporter.record({
              testName:
                "history says a draft should exist and assistant calls out mismatch",
              model: model.label,
              pass,
              actual: [
                summarizeToolCalls(trace.toolCalls),
                assistantText && mismatchJudge
                  ? formatSemanticJudgeActual(assistantText, mismatchJudge)
                  : assistantText
                    ? `assistant=${JSON.stringify(assistantText)}`
                    : "no assistant text",
              ].join(" | "),
              criteria: mismatchJudge ? [mismatchJudge] : [],
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "notes the mismatch when history says no draft should have happened but the user says one did",
          async () => {
            const explanationMessage = getMockMessage({
              id: "msg-microsoft-feedback-5",
              threadId: "thread-microsoft-feedback-5",
              from: "updates@status.example",
              subject: "Weekly rollout summary",
              snippet: "Review-only status update for this week.",
              labelIds: ["UNREAD"],
            });

            mockGetMessage.mockResolvedValue(explanationMessage);
            mockSearchMessages.mockImplementation(async ({ query }) => {
              const normalized = query.trim().toLowerCase();
              if (
                normalized.includes("updates@status.example") ||
                normalized.includes("rollout") ||
                normalized.includes("summary")
              ) {
                return {
                  messages: [explanationMessage],
                  nextPageToken: undefined,
                };
              }

              return {
                messages: [],
                nextPageToken: undefined,
              };
            });
            prisma.executedRule.findMany.mockResolvedValue([
              {
                id: "executed-rule-no-draft-mismatch-1",
                ruleId: "rule-fyi-updates",
                threadId: explanationMessage.threadId,
                createdAt: new Date("2026-04-20T13:00:00.000Z"),
                status: "APPLIED",
                reason:
                  'Matched the "FYI Updates" rule, which files rollout summaries for review and does not prepare a reply draft.',
                matchMetadata: [{ type: "STATIC" }],
                automated: true,
                actionItems: [],
                rule: {
                  id: "rule-fyi-updates",
                  name: "FYI Updates",
                },
              },
            ]);

            const trace = await runAssistantChat({
              emailAccount: withMicrosoftProvider(emailAccount),
              messages: [
                {
                  role: "user",
                  content:
                    "Why did you draft a reply to the email from updates@status.example about the weekly rollout summary?",
                },
              ],
            });

            const searchResults = getSearchInboxResults(trace);
            const firstSuccessfulSearch = searchResults.find(
              (result) =>
                Array.isArray(result.output.messages) &&
                result.output.messages.some(
                  (message) => message.messageId === explanationMessage.id,
                ),
            );
            const searchCall = getFirstMatchingToolCall(
              trace.toolCalls,
              "searchInbox",
              isSearchInboxInput,
            );
            const executionCall = getFirstMatchingToolCall(
              trace.toolCalls,
              "getRuleExecutionForMessage",
              isGetRuleExecutionInput,
            );
            const assistantText = getAssistantText(trace);
            const mismatchJudge = assistantText
              ? await judgeEvalOutput({
                  input: [
                    "The user says a reply draft appeared for a specific email.",
                    "The assistant found the email and loaded the exact executed rule history for that message.",
                    'Retrieved execution: ruleName="FYI Updates"; reason="Matched the FYI Updates rule, which files rollout summaries for review and does not prepare a reply draft."',
                  ].join("\n"),
                  output: assistantText,
                  expected:
                    "A response that explicitly notes the mismatch: the recorded execution says this email should have been filed for review without drafting, so the user's report of a draft does not line up with the retrieved history. It may suggest an unexpected automation or UI issue, but should not invent certainty.",
                  criterion: {
                    name: "Detects mismatch when unexpected draft appears",
                    description:
                      "When the user's reported draft conflicts with retrieved execution history that says no draft should have been prepared, the assistant should point out that inconsistency clearly and avoid inventing a confident cause.",
                  },
                })
              : null;

            const pass =
              !!firstSuccessfulSearch &&
              !!searchCall &&
              !!executionCall &&
              searchCall.index < executionCall.index &&
              executionCall.input.messageId === explanationMessage.id &&
              !hasWriteToolCalls(trace.toolCalls) &&
              !!mismatchJudge?.pass &&
              prisma.executedRule.findMany.mock.calls.some(
                ([args]) =>
                  args?.where?.messageId === explanationMessage.id &&
                  args?.where?.emailAccountId === emailAccount.id,
              );

            evalReporter.record({
              testName:
                "history says no draft should exist and assistant calls out mismatch",
              model: model.label,
              pass,
              actual: [
                summarizeToolCalls(trace.toolCalls),
                assistantText && mismatchJudge
                  ? formatSemanticJudgeActual(assistantText, mismatchJudge)
                  : assistantText
                    ? `assistant=${JSON.stringify(assistantText)}`
                    : "no assistant text",
              ].join(" | "),
              criteria: mismatchJudge ? [mismatchJudge] : [],
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

type GetRuleExecutionInput = {
  messageId: string;
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

function isGetRuleExecutionInput(
  value: unknown,
): value is GetRuleExecutionInput {
  return isRecord(value) && typeof value.messageId === "string";
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
    "sendEmail",
    "replyEmail",
    "forwardEmail",
    "saveMemory",
    "addToKnowledgeBase",
  ]);

  return toolCalls.some((toolCall) => writeToolNames.has(toolCall.toolName));
}

function hasLookupDependentToolCalls(toolCalls: RecordedToolCall[]) {
  const lookupDependentToolNames = new Set([
    "readEmail",
    "replyEmail",
    "forwardEmail",
    "getRuleExecutionForMessage",
  ]);

  return toolCalls.some((toolCall) =>
    lookupDependentToolNames.has(toolCall.toolName),
  );
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

function getAssistantText(trace: Awaited<ReturnType<typeof runAssistantChat>>) {
  const stepText = trace.stepTexts.join("\n\n").trim();
  if (stepText) return stepText;

  return trace.finalText.trim();
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
