import { afterAll, describe, expect, test } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { formatSemanticJudgeActual } from "@/__tests__/eval/semantic-judge";
import { getMockMessage } from "@/__tests__/helpers";
import {
  cloneEmailAccountForProvider,
  getFirstSearchInboxCall,
  getLastMatchingToolCall,
  hasNoWriteToolCalls,
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
        test.each(inboxWorkflowProviders)(
          "does not bulk archive sender cleanup before the user confirms [$label]",
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
              !toolCalls.some(
                (toolCall) => toolCall.toolName === "manageInbox",
              ) &&
              hasNoWriteToolCalls(toolCalls);

            evalReporter.record({
              testName: `sender cleanup requires confirmation before write (${label})`,
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
