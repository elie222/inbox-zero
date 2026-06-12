import { afterAll, describe, expect, test } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getMockMessage } from "@/__tests__/helpers";
import { getStableMessageCacheKey } from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  cloneEmailAccountForProvider,
  getFirstSearchInboxCall,
  hasNoWriteToolCalls,
  hasReplyTriageFocus,
  hasSearchBeforeFirstWrite,
  hasUnreadTriageSignal,
  inboxWorkflowProviders,
  mockSearchMessages,
  runAssistantChat,
  setupInboxWorkflowEval,
  shouldRunEval,
  TIMEOUT,
} from "@/__tests__/eval/assistant-chat-inbox-workflows-test-utils";

// pnpm test-ai eval/assistant-chat-inbox-workflows
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-inbox-workflows

const evalReporter = createEvalReporter({
  evalName: "assistant-chat-inbox-workflows-triage",
});

describe.runIf(shouldRunEval)(
  "Eval: assistant chat inbox workflows triage",
  () => {
    setupInboxWorkflowEval();

    describeEvalMatrix(
      "assistant-chat inbox workflows triage",
      (model, emailAccount) => {
        test.each(inboxWorkflowProviders)(
          "handles inbox update requests with read-only triage search first [$label]",
          async ({ provider, label, unreadSignal }) => {
            const testName = `inbox update uses triage search first (${label})`;
            const searchMessages = [
              getMockMessage({
                id: "msg-triage-1",
                threadId: "thread-triage-1",
                from: "founder@client.example",
                subject: "Need approval today",
                snippet: "Can you confirm the rollout before 3pm?",
                labelIds: ["UNREAD", "Label_To Reply"],
              }),
              getMockMessage({
                id: "msg-triage-2",
                threadId: "thread-triage-2",
                from: "updates@vendor.example",
                subject: "Weekly platform digest",
                snippet: "Here is this week's product update.",
                labelIds: ["UNREAD"],
              }),
            ];
            const inboxStats = { total: 240, unread: 18 };
            const messages = [
              {
                role: "user" as const,
                content: "Help me handle my inbox today.",
              },
            ];

            const record = await evalReporter.recordCached(
              {
                testName,
                model: model.label,
                cacheKeyParts: [
                  {
                    model,
                    provider,
                    label,
                    unreadSignal,
                    searchMessages: getStableMessageCacheKey(searchMessages),
                    inboxStats,
                    messages,
                  },
                ],
              },
              async () => {
                mockSearchMessages.mockResolvedValueOnce({
                  messages: searchMessages,
                  nextPageToken: undefined,
                });

                const { toolCalls, actual } = await runAssistantChat({
                  emailAccount: cloneEmailAccountForProvider(
                    emailAccount,
                    provider,
                  ),
                  inboxStats,
                  messages,
                });

                const searchCall = getFirstSearchInboxCall(toolCalls);

                const pass =
                  !!searchCall &&
                  hasSearchBeforeFirstWrite(toolCalls) &&
                  hasUnreadTriageSignal(
                    searchCall.query,
                    provider,
                    unreadSignal,
                  ) &&
                  hasNoWriteToolCalls(toolCalls);

                return {
                  pass,
                  actual,
                };
              },
            );

            expect(record.pass, record.actual).toBe(true);
          },
          TIMEOUT,
        );

        test.each(inboxWorkflowProviders)(
          "verifies with searchInbox before claiming no unread emails on follow-up [$label]",
          async ({ provider, label, unreadSignal }) => {
            mockSearchMessages.mockResolvedValueOnce({
              messages: [
                getMockMessage({
                  id: "msg-still-unread-1",
                  threadId: "thread-still-unread-1",
                  from: "vendor@partner.example",
                  subject: "Awaiting your reply",
                  snippet: "Following up on my earlier note.",
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
              inboxStats: { total: 240, unread: 6 },
              messages: [
                {
                  role: "user",
                  content: "Show me anything I should reply to today.",
                },
                {
                  role: "assistant",
                  content:
                    "I went through your inbox and replied to the urgent threads.",
                },
                {
                  role: "user",
                  content: "Do I have any other unread emails?",
                },
              ],
            });

            const searchCall = getFirstSearchInboxCall(toolCalls);

            const pass =
              !!searchCall &&
              hasUnreadTriageSignal(searchCall.query, provider, unreadSignal);

            evalReporter.record({
              testName: `verifies unread on follow-up (${label})`,
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test.each(inboxWorkflowProviders)(
          "re-runs searchInbox when user pushes back with 'look again' [$label]",
          async ({ provider, label, unreadSignal }) => {
            mockSearchMessages.mockResolvedValueOnce({
              messages: [
                getMockMessage({
                  id: "msg-rechecked-1",
                  threadId: "thread-rechecked-1",
                  from: "ops@partner.example",
                  subject: "Quick decision needed",
                  snippet: "Can you confirm by EOD?",
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
              inboxStats: { total: 240, unread: 6 },
              messages: [
                {
                  role: "user",
                  content: "Do I have any unread emails?",
                },
                {
                  role: "assistant",
                  content:
                    "Your inbox looks caught up — no unread emails right now.",
                },
                {
                  role: "user",
                  content: "look again",
                },
              ],
            });

            const searchCall = getFirstSearchInboxCall(toolCalls);

            const pass =
              !!searchCall &&
              hasUnreadTriageSignal(searchCall.query, provider, unreadSignal);

            evalReporter.record({
              testName: `re-runs searchInbox on look-again (${label})`,
              model: model.label,
              pass,
              actual,
            });

            expect(pass).toBe(true);
          },
          TIMEOUT,
        );

        test.each(inboxWorkflowProviders)(
          "uses read-only inbox search for reply triage requests [$label]",
          async ({ provider, label }) => {
            const testName = `reply triage stays read-only (${label})`;
            const searchMessages = [
              getMockMessage({
                id: "msg-reply-1",
                threadId: "thread-reply-1",
                from: "ops@partner.example",
                subject: "Question on the revised plan",
                snippet: "Can you send your answer today?",
                labelIds: ["UNREAD", "Label_To Reply"],
              }),
              getMockMessage({
                id: "msg-reply-2",
                threadId: "thread-reply-2",
                from: "digest@briefings.example",
                subject: "Morning roundup",
                snippet: "Here are the top stories for today.",
                labelIds: ["UNREAD"],
              }),
            ];
            const messages = [
              {
                role: "user" as const,
                content: "Do I need to reply to any mail?",
              },
            ];

            const record = await evalReporter.recordCached(
              {
                testName,
                model: model.label,
                cacheKeyParts: [
                  {
                    model,
                    provider,
                    label,
                    searchMessages: getStableMessageCacheKey(searchMessages),
                    messages,
                  },
                ],
              },
              async () => {
                mockSearchMessages.mockResolvedValueOnce({
                  messages: searchMessages,
                  nextPageToken: undefined,
                });

                const { toolCalls, actual } = await runAssistantChat({
                  emailAccount: cloneEmailAccountForProvider(
                    emailAccount,
                    provider,
                  ),
                  messages,
                });

                const searchCall = getFirstSearchInboxCall(toolCalls);

                const pass =
                  !!searchCall &&
                  hasSearchBeforeFirstWrite(toolCalls) &&
                  hasReplyTriageFocus(searchCall.query, provider) &&
                  hasNoWriteToolCalls(toolCalls);

                return {
                  pass,
                  actual,
                };
              },
            );

            expect(record.pass, record.actual).toBe(true);
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
