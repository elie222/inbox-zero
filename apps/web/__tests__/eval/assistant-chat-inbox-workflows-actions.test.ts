import { afterAll, describe, expect, test } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { formatSemanticJudgeActual } from "@/__tests__/eval/semantic-judge";
import { getMockMessage } from "@/__tests__/helpers";
import {
  cloneEmailAccountForProvider,
  getFirstSearchInboxCall,
  getLastMatchingToolCall,
  hasSearchBeforeFirstWrite,
  inboxWorkflowProviders,
  isBulkArchiveSendersInput,
  isManageInboxThreadActionInput,
  judgeSearchInboxQuery,
  mockSearchMessages,
  runAssistantChat,
  setupInboxWorkflowEval,
  shouldRunEval,
  TIMEOUT,
} from "@/__tests__/eval/assistant-chat-inbox-workflows-test-utils";

// pnpm test-ai eval/assistant-chat-inbox-workflows
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-inbox-workflows

const evalReporter = createEvalReporter();

describe.runIf(shouldRunEval)(
  "Eval: assistant chat inbox workflows actions",
  () => {
    setupInboxWorkflowEval();

    describeEvalMatrix(
      "assistant-chat inbox workflows actions",
      (model, emailAccount) => {
        test.each(
          inboxWorkflowProviders,
        )("paginates bulk archive requests until all matching threads are covered [$label]", async ({
          provider,
          label,
        }) => {
          mockSearchMessages
            .mockResolvedValueOnce({
              messages: buildBulkArchiveMessages(20, 0),
              nextPageToken: "PAGE_TOKEN_2",
            })
            .mockResolvedValueOnce({
              messages: buildBulkArchiveMessages(20, 20),
              nextPageToken: "PAGE_TOKEN_3",
            })
            .mockResolvedValueOnce({
              messages: buildBulkArchiveMessages(20, 40),
              nextPageToken: "PAGE_TOKEN_4",
            })
            .mockResolvedValueOnce({
              messages: buildBulkArchiveMessages(20, 60),
              nextPageToken: "PAGE_TOKEN_5",
            })
            .mockResolvedValueOnce({
              messages: buildBulkArchiveMessages(20, 80),
              nextPageToken: "PAGE_TOKEN_6",
            })
            .mockResolvedValueOnce({
              messages: buildBulkArchiveMessages(20, 100),
              nextPageToken: undefined,
            });

          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, provider),
            messages: [
              {
                role: "user",
                content:
                  "Archive all unread emails older than 3 years in my inbox.",
              },
            ],
          });

          const searchCalls = getSearchInboxCalls(toolCalls);
          const firstSearchCall = searchCalls[0];
          const archiveCalls = getManageInboxArchiveCalls(toolCalls);
          const archivedThreadIds = new Set(
            archiveCalls.flatMap((call) => call.threadIds),
          );

          const pass =
            !!firstSearchCall &&
            isBulkArchiveSearchQuery(firstSearchCall.query, provider) &&
            hasSearchBeforeFirstWrite(toolCalls) &&
            searchCalls.length >= 6 &&
            !searchCalls[0]?.pageToken &&
            searchCalls.some((call) => call.pageToken === "PAGE_TOKEN_2") &&
            searchCalls.some((call) => call.pageToken === "PAGE_TOKEN_3") &&
            archiveCalls.length >= 2 &&
            archiveCalls.every((call) => call.threadIds.length <= 100) &&
            archivedThreadIds.size === 120 &&
            archivedThreadIds.has("thread-bulk-1") &&
            archivedThreadIds.has("thread-bulk-120") &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "manageInbox" &&
                isBulkArchiveSendersInput(toolCall.input),
            );

          evalReporter.record({
            testName: `bulk archive paginates across all matches (${label})`,
            model: model.label,
            pass,
            actual: firstSearchCall
              ? `${actual} | query=${firstSearchCall.query}`
              : actual,
          });

          expect(pass).toBe(true);
        }, 180_000);

        test.each(inboxWorkflowProviders)(
          "executes explicit sender cleanup after search [$label]",
          async ({ provider, label }) => {
            mockSearchMessages.mockResolvedValueOnce({
              messages: [
                getMockMessage({
                  id: "msg-cleanup-1",
                  threadId: "thread-cleanup-1",
                  from: "alerts@sitebuilder.example",
                  subject: "Your weekly site report",
                  snippet: "Traffic highlights and plugin notices.",
                  labelIds: ["UNREAD"],
                }),
                getMockMessage({
                  id: "msg-cleanup-2",
                  threadId: "thread-cleanup-2",
                  from: "alerts@sitebuilder.example",
                  subject: "Comment moderation summary",
                  snippet: "You have 12 new comments awaiting review.",
                  labelIds: [],
                }),
              ],
              nextPageToken: undefined,
            });

            const { toolCalls, actual } = await runAssistantChat({
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                provider,
              ),
              inboxStats: { total: 480, unread: 22 },
              messages: [
                {
                  role: "user",
                  content: "Delete all SiteBuilder emails from my inbox.",
                },
              ],
            });

            const searchCall = getFirstSearchInboxCall(toolCalls);
            const searchJudge = searchCall
              ? await judgeSearchInboxQuery({
                  prompt: "Delete all SiteBuilder emails from my inbox.",
                  query: searchCall.query,
                  expected:
                    "A search query focused on SiteBuilder emails in the inbox.",
                })
              : null;

            const pass =
              !!searchCall &&
              !!searchJudge?.pass &&
              hasSearchBeforeFirstWrite(toolCalls) &&
              toolCalls.some(
                (toolCall) =>
                  toolCall.toolName === "manageInbox" &&
                  isBulkArchiveSendersInput(toolCall.input),
              );

            evalReporter.record({
              testName: `explicit sender cleanup executes after search (${label})`,
              model: model.label,
              pass,
              actual:
                searchCall && searchJudge
                  ? `${actual} | ${formatSemanticJudgeActual(
                      searchCall.query,
                      searchJudge,
                    )}`
                  : actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test.each(inboxWorkflowProviders)(
          "archives specific searched threads instead of bulk sender cleanup [$label]",
          async ({ provider, label }) => {
            mockSearchMessages.mockResolvedValueOnce({
              messages: [
                getMockMessage({
                  id: "msg-archive-1",
                  threadId: "thread-archive-1",
                  from: "alerts@sitebuilder.example",
                  subject: "Weekly site report",
                  snippet: "Traffic highlights and plugin notices.",
                  labelIds: ["UNREAD"],
                }),
                getMockMessage({
                  id: "msg-archive-2",
                  threadId: "thread-archive-2",
                  from: "alerts@sitebuilder.example",
                  subject: "Comment moderation summary",
                  snippet: "You have 12 new comments awaiting review.",
                  labelIds: [],
                }),
              ],
              nextPageToken: undefined,
            });

            const { toolCalls, actual } = await runAssistantChat({
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                provider,
              ),
              messages: [
                {
                  role: "user",
                  content:
                    "Archive the two SiteBuilder emails in my inbox, but do not unsubscribe me or archive everything from that sender.",
                },
              ],
            });

            const searchCall = getFirstSearchInboxCall(toolCalls);
            const searchJudge = searchCall
              ? await judgeSearchInboxQuery({
                  prompt:
                    "Archive the two SiteBuilder emails in my inbox, but do not unsubscribe me or archive everything from that sender.",
                  query: searchCall.query,
                  expected:
                    "A search query focused on the SiteBuilder emails currently in the inbox.",
                })
              : null;
            const archiveCall = getLastMatchingToolCall(
              toolCalls,
              "manageInbox",
              isManageInboxThreadActionInput,
            )?.input;

            const pass =
              !!searchCall &&
              !!archiveCall &&
              !!searchJudge?.pass &&
              hasSearchBeforeFirstWrite(toolCalls) &&
              archiveCall.action === "archive_threads" &&
              archiveCall.threadIds.length === 2 &&
              archiveCall.threadIds.includes("thread-archive-1") &&
              archiveCall.threadIds.includes("thread-archive-2") &&
              !toolCalls.some(
                (toolCall) =>
                  toolCall.toolName === "manageInbox" &&
                  isBulkArchiveSendersInput(toolCall.input),
              );

            evalReporter.record({
              testName: `specific archive uses archive_threads (${label})`,
              model: model.label,
              pass,
              actual:
                searchCall && searchJudge
                  ? `${actual} | ${formatSemanticJudgeActual(
                      searchCall.query,
                      searchJudge,
                    )}`
                  : actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test.each(inboxWorkflowProviders)(
          "marks specific searched threads read [$label]",
          async ({ provider, label }) => {
            mockSearchMessages.mockResolvedValueOnce({
              messages: [
                getMockMessage({
                  id: "msg-markread-1",
                  threadId: "thread-markread-1",
                  from: "updates@vendor.example",
                  subject: "Release notes",
                  snippet: "The release has shipped.",
                  labelIds: ["UNREAD"],
                }),
                getMockMessage({
                  id: "msg-markread-2",
                  threadId: "thread-markread-2",
                  from: "updates@vendor.example",
                  subject: "Maintenance complete",
                  snippet: "The maintenance window has ended.",
                  labelIds: ["UNREAD"],
                }),
              ],
              nextPageToken: undefined,
            });

            const { toolCalls, actual } = await runAssistantChat({
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                provider,
              ),
              messages: [
                {
                  role: "user",
                  content:
                    "Mark the two unread vendor update emails as read, but do not archive them.",
                },
              ],
            });

            const searchCall = getFirstSearchInboxCall(toolCalls);
            const searchJudge = searchCall
              ? await judgeSearchInboxQuery({
                  prompt:
                    "Mark the two unread vendor update emails as read, but do not archive them.",
                  query: searchCall.query,
                  expected:
                    "A search query focused on unread vendor update emails.",
                })
              : null;
            const markReadCall = getLastMatchingToolCall(
              toolCalls,
              "manageInbox",
              isManageInboxThreadActionInput,
            )?.input;

            const pass =
              !!searchCall &&
              !!markReadCall &&
              !!searchJudge?.pass &&
              hasSearchBeforeFirstWrite(toolCalls) &&
              markReadCall.action === "mark_read_threads" &&
              markReadCall.threadIds.length === 2 &&
              markReadCall.threadIds.includes("thread-markread-1") &&
              markReadCall.threadIds.includes("thread-markread-2") &&
              !toolCalls.some(
                (toolCall) =>
                  toolCall.toolName === "manageInbox" &&
                  isManageInboxThreadActionInput(toolCall.input) &&
                  toolCall.input.action === "archive_threads",
              );

            evalReporter.record({
              testName: `specific mark read uses mark_read_threads (${label})`,
              model: model.label,
              pass,
              actual:
                searchCall && searchJudge
                  ? `${actual} | ${formatSemanticJudgeActual(
                      searchCall.query,
                      searchJudge,
                    )}`
                  : actual,
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

type SearchInboxInput = {
  query: string;
  pageToken?: string | null;
};

function getSearchInboxCalls(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  return toolCalls
    .filter(
      (
        toolCall,
      ): toolCall is {
        toolName: "searchInbox";
        input: SearchInboxInput;
      } =>
        toolCall.toolName === "searchInbox" &&
        isSearchInboxInput(toolCall.input),
    )
    .map((toolCall) => toolCall.input);
}

function getManageInboxArchiveCalls(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  return toolCalls
    .filter(
      (
        toolCall,
      ): toolCall is {
        toolName: "manageInbox";
        input: {
          action: "archive_threads";
          threadIds: string[];
        };
      } =>
        toolCall.toolName === "manageInbox" &&
        isManageInboxThreadActionInput(toolCall.input) &&
        toolCall.input.action === "archive_threads",
    )
    .map((toolCall) => toolCall.input);
}

function isSearchInboxInput(input: unknown): input is SearchInboxInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { query?: unknown }).query === "string"
  );
}

function buildBulkArchiveMessages(count: number, startIndex: number) {
  return Array.from({ length: count }, (_, index) => {
    const messageNumber = startIndex + index + 1;

    return getMockMessage({
      id: `msg-bulk-${messageNumber}`,
      threadId: `thread-bulk-${messageNumber}`,
      from: `archive-${messageNumber}@updates.example`,
      subject: `Unread archive candidate ${messageNumber}`,
      snippet: `Unread archive candidate ${messageNumber}`,
      labelIds: ["UNREAD", "INBOX"],
    });
  });
}

function isBulkArchiveSearchQuery(
  query: string,
  provider: "google" | "microsoft",
) {
  const normalizedQuery = query.toLowerCase();

  if (provider === "microsoft") {
    const receivedDateMatch = normalizedQuery.match(
      /received\s*(?:<=|<)\s*(\d{4}-\d{2}-\d{2})(?:t[\d:.+-]+z?)?/,
    );

    return (
      normalizedQuery.includes("unread") &&
      !!receivedDateMatch?.[1] &&
      isApproxThreeYearsAgo(receivedDateMatch[1], "-")
    );
  }

  const beforeDateMatch = normalizedQuery.match(/before:(\d{4}\/\d{2}\/\d{2})/);

  return (
    normalizedQuery.includes("is:unread") &&
    (normalizedQuery.includes("older_than:3y") ||
      (!!beforeDateMatch?.[1] &&
        isApproxThreeYearsAgo(beforeDateMatch[1], "/")))
  );
}

function isApproxThreeYearsAgo(
  dateString: string,
  separator: "-" | "/",
  maxDayDelta = 2,
) {
  const parts = dateString.split(separator).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return false;

  const [year, month, day] = parts;
  const actual = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(actual.getTime())) return false;

  const expected = new Date();
  expected.setUTCHours(0, 0, 0, 0);
  expected.setUTCFullYear(expected.getUTCFullYear() - 3);

  const dayDelta = Math.abs(actual.getTime() - expected.getTime()) / 86_400_000;

  return dayDelta <= maxDayDelta;
}
