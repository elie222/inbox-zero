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
        test.each([
          {
            name: "newsletter",
            prompt: "Mark all newsletter emails as read.",
            categoryName: "newsletter",
          },
          {
            name: "receipts category",
            prompt: "Mark every unread email in my Receipts category as read.",
            categoryName: "Receipts",
          },
          {
            name: "operations folder",
            prompt: "Mark all unread messages in my Operations folder as read.",
            categoryName: "Operations",
          },
        ])(
          "continues Outlook mark-read cleanup through empty filtered pages [$name]",
          async ({ prompt, categoryName }) => {
            mockSearchMessages.mockImplementation(
              async (input: ProviderSearchInput) => {
                if (
                  input.labelName?.toLowerCase() !== categoryName.toLowerCase()
                ) {
                  return {
                    messages: [],
                    nextPageToken: undefined,
                  };
                }

                if (input.pageToken === "PAGE_TOKEN_2") {
                  return {
                    messages: buildCategorizedMessages({
                      count: 11,
                      categoryName,
                    }),
                    nextPageToken: undefined,
                  };
                }

                return {
                  messages: [],
                  nextPageToken: "PAGE_TOKEN_2",
                };
              },
            );

            const { toolCalls, actual } = await runAssistantChat({
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                "microsoft",
              ),
              inboxStats: { total: 210, unread: 24 },
              messages: [
                {
                  role: "user",
                  content: prompt,
                },
              ],
            });

            const searchCalls = getSearchInboxCalls(toolCalls);
            const providerSearchCalls = getProviderSearchCalls();
            const firstMarkReadIndex = toolCalls.findIndex(
              (toolCall) =>
                toolCall.toolName === "manageInbox" &&
                isManageInboxThreadActionInput(toolCall.input) &&
                toolCall.input.action === "mark_read_threads",
            );
            const markReadCalls = getManageInboxMarkReadCalls(toolCalls);
            const markedThreadIds = new Set(
              markReadCalls.flatMap((call) => call.threadIds),
            );

            const pass =
              searchCalls.length >= 1 &&
              !searchCalls[0]?.pageToken &&
              providerSearchCalls.some(
                (call) =>
                  call.query === "" &&
                  call.labelName?.toLowerCase() === categoryName.toLowerCase(),
              ) &&
              providerSearchCalls.some(
                (call) =>
                  call.pageToken === "PAGE_TOKEN_2" &&
                  call.query === "" &&
                  call.labelName?.toLowerCase() === categoryName.toLowerCase(),
              ) &&
              firstMarkReadIndex > 0 &&
              markedThreadIds.size === 11 &&
              markedThreadIds.has("thread-category-1") &&
              markedThreadIds.has("thread-category-11") &&
              !providerSearchCalls.some((call) =>
                /\bfrom:/i.test(call.query ?? ""),
              );

            evalReporter.record({
              testName:
                "outlook scoped mark read paginates empty filtered page",
              model: model.label,
              pass,
              actual: `${actual} | providerSearch=${summarizeProviderSearchCalls(providerSearchCalls)}`,
            });

            expect(
              pass,
              `${actual} | providerSearch=${summarizeProviderSearchCalls(providerSearchCalls)}`,
            ).toBe(true);
          },
          TIMEOUT,
        );

        test.each(
          inboxWorkflowProviders,
        )("paginates bulk archive requests until all matching threads are covered [$label]", async ({
          provider,
          label,
        }) => {
          let matchingSearchCount = 0;
          mockSearchMessages.mockImplementation(
            async (input: SearchInboxInput) => {
              if (!isBulkArchiveSearchQuery(input, provider)) {
                return {
                  messages: [],
                  nextPageToken: undefined,
                };
              }

              matchingSearchCount += 1;

              if (matchingSearchCount === 1) {
                return {
                  messages: buildBulkArchiveMessages(20, 0),
                  nextPageToken: "PAGE_TOKEN_2",
                };
              }

              return {
                messages: [],
                nextPageToken: undefined,
              };
            },
          );

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
          const bulkSearchCall =
            searchCalls.find((call) =>
              isBulkArchiveSearchQuery(call, provider),
            ) ?? searchCalls[0];
          const archiveCalls = getManageInboxArchiveCalls(toolCalls);
          const archivedThreadIds = new Set(
            archiveCalls.flatMap((call) => call.threadIds),
          );

          const pass =
            !!bulkSearchCall &&
            isBulkArchiveSearchQuery(bulkSearchCall, provider) &&
            hasSearchBeforeFirstWrite(toolCalls) &&
            searchCalls.length >= 2 &&
            searchCalls.some(
              (call) =>
                isBulkArchiveSearchQuery(call, provider) && !call.pageToken,
            ) &&
            searchCalls.some((call) => call.pageToken === "PAGE_TOKEN_2") &&
            archiveCalls.length >= 1 &&
            archiveCalls.every((call) => call.threadIds.length <= 100) &&
            archivedThreadIds.size === 20 &&
            archivedThreadIds.has("thread-bulk-1") &&
            archivedThreadIds.has("thread-bulk-20") &&
            !toolCalls.some(
              (toolCall) =>
                toolCall.toolName === "manageInbox" &&
                isBulkArchiveSendersInput(toolCall.input),
            );

          evalReporter.record({
            testName: `bulk archive paginates across all matches (${label})`,
            model: model.label,
            pass,
            actual: bulkSearchCall
              ? `${actual} | query=${bulkSearchCall.query} | searches=${searchCalls.length} archived=${archivedThreadIds.size} archiveCalls=${archiveCalls.length}`
              : actual,
          });

          expect(
            pass,
            bulkSearchCall
              ? `${actual} | query=${bulkSearchCall.query} | searches=${searchCalls.length} archived=${archivedThreadIds.size} archiveCalls=${archiveCalls.length}`
              : actual,
          ).toBe(true);
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
                    "A search query focused on SiteBuilder emails in the inbox. A simple SiteBuilder keyword query is acceptable when it targets those messages.",
                })
              : null;
            const trashCalls = getManageInboxTrashCalls(toolCalls);
            const trashedThreadIds = new Set(
              trashCalls.flatMap((call) => call.threadIds),
            );

            const pass =
              !!searchCall &&
              !!searchJudge?.pass &&
              hasSearchBeforeFirstWrite(toolCalls) &&
              trashCalls.length > 0 &&
              trashedThreadIds.has("thread-cleanup-1") &&
              trashedThreadIds.has("thread-cleanup-2") &&
              !toolCalls.some(
                (toolCall) =>
                  toolCall.toolName === "manageInbox" &&
                  isBulkArchiveSendersInput(toolCall.input),
              );

            evalReporter.record({
              testName: `explicit sender trash cleanup executes after search (${label})`,
              model: model.label,
              pass,
              actual:
                searchCall && searchJudge
                  ? `${actual} | trashCalls=${trashCalls.length} trashed=${Array.from(trashedThreadIds).join(",")} | ${formatSemanticJudgeActual(
                      searchCall.query,
                      searchJudge,
                    )}`
                  : actual,
            });

            expect(
              pass,
              `${actual} | trashCalls=${trashCalls.length} trashed=${Array.from(trashedThreadIds).join(",")}`,
            ).toBe(true);
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
                    provider === "microsoft"
                      ? "A search query focused on the SiteBuilder emails currently in the inbox. A simple SiteBuilder keyword query is acceptable when it targets those messages."
                      : "A search query focused on the SiteBuilder emails currently in the inbox.",
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
                    provider === "microsoft"
                      ? "A search query focused on vendor update emails. The unread constraint may be represented by the structured readState field instead of the query text."
                      : "A search query focused on unread vendor update emails.",
                })
              : null;
            const searchHasUnreadScope =
              provider !== "microsoft" ||
              (searchCall as SearchInboxInput | undefined)?.readState ===
                "unread" ||
              /\bunread\b/i.test(searchCall?.query ?? "");
            const markReadCall = getLastMatchingToolCall(
              toolCalls,
              "manageInbox",
              isManageInboxThreadActionInput,
            )?.input;

            const pass =
              !!searchCall &&
              !!markReadCall &&
              !!searchJudge?.pass &&
              searchHasUnreadScope &&
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
  categoryName?: string | null;
  readState?: "read" | "unread" | null;
};

type ProviderSearchInput = {
  query?: string;
  pageToken?: string | null;
  labelName?: string | null;
  readState?: "read" | "unread" | null;
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

function getProviderSearchCalls() {
  return mockSearchMessages.mock.calls.map(
    ([input]) => input as ProviderSearchInput,
  );
}

function summarizeProviderSearchCalls(calls: ProviderSearchInput[]) {
  return calls
    .map((call) => {
      const parts = [`query=${call.query ?? ""}`];
      if (call.pageToken) parts.push(`pageToken=${call.pageToken}`);
      if (call.labelName) parts.push(`labelName=${call.labelName}`);
      if (call.readState) parts.push(`readState=${call.readState}`);
      return `searchMessages(${parts.join(", ")})`;
    })
    .join(" | ");
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

function getManageInboxTrashCalls(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  return toolCalls
    .filter(
      (
        toolCall,
      ): toolCall is {
        toolName: "manageInbox";
        input: {
          action: "trash_threads";
          threadIds: string[];
        };
      } =>
        toolCall.toolName === "manageInbox" &&
        isManageInboxThreadActionInput(toolCall.input) &&
        toolCall.input.action === "trash_threads",
    )
    .map((toolCall) => toolCall.input);
}

function getManageInboxMarkReadCalls(
  toolCalls: Array<{ toolName: string; input: unknown }>,
) {
  return toolCalls
    .filter(
      (
        toolCall,
      ): toolCall is {
        toolName: "manageInbox";
        input: {
          action: "mark_read_threads";
          threadIds: string[];
        };
      } =>
        toolCall.toolName === "manageInbox" &&
        isManageInboxThreadActionInput(toolCall.input) &&
        toolCall.input.action === "mark_read_threads",
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

function buildCategorizedMessages({
  count,
  categoryName,
}: {
  count: number;
  categoryName: string;
}) {
  return Array.from({ length: count }, (_, index) => {
    const messageNumber = index + 1;

    return getMockMessage({
      id: `msg-category-${messageNumber}`,
      threadId: `thread-category-${messageNumber}`,
      from:
        messageNumber % 2 === 0
          ? "updates@vendor.example"
          : "digest@service.example",
      subject: `Scoped update ${messageNumber}`,
      snippet: `Scoped issue ${messageNumber}`,
      labelIds: ["UNREAD", categoryName],
    });
  });
}

function isBulkArchiveSearchQuery(
  searchCall: SearchInboxInput,
  provider: "google" | "microsoft",
) {
  const normalizedQuery = searchCall.query.toLowerCase();

  if (provider === "microsoft") {
    const receivedDateMatch = normalizedQuery.match(
      /received\s*(?:<=|<)\s*(\d{4}-\d{2}-\d{2})(?:t[\d:.+-]+z?)?/,
    );

    return (
      (searchCall.readState === "unread" ||
        normalizedQuery.includes("unread")) &&
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
