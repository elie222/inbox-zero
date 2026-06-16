// Import test-utils first: it declares the vi.mock for the email provider and
// prisma. Importing a module that pulls the real app graph (e.g.
// assistant-chat-eval-utils) before this would bind the unmocked
// createEmailProvider, so searchInbox would hit a real DB and return no content.
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
import { afterAll, describe, expect, test } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getMockMessage } from "@/__tests__/helpers";
import { getStableMessageCacheKey } from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";

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

        test.each(inboxWorkflowProviders)(
          "triage summary describes each email's actual content, not just the recommended action [$label]",
          async ({ provider, label }) => {
            const testName = `triage summary surfaces email content (${label})`;
            const searchMessages = [
              getMockMessage({
                id: "msg-content-1",
                threadId: "thread-content-1",
                from: "partnerships@brand.example",
                subject: "Collaboration proposal",
                snippet:
                  "We'd love to sponsor a post on your blog for $1,500 and ship you our new device to review.",
                labelIds: ["UNREAD", "Label_To Reply"],
              }),
              getMockMessage({
                id: "msg-content-2",
                threadId: "thread-content-2",
                from: "receipts@payments.example",
                subject: "Your payout has arrived",
                snippet:
                  "A payout of $4,200 has cleared to your bank. Upload the attached receipt to your bookkeeping by Friday.",
                labelIds: ["UNREAD"],
              }),
              getMockMessage({
                id: "msg-content-3",
                threadId: "thread-content-3",
                from: "noreply@analytics.example",
                subject: "Daily metrics recap",
                snippet:
                  "Yesterday you had 32 new signups and $980 in new MRR. Churn held flat.",
                labelIds: ["UNREAD"],
              }),
            ];
            const inboxStats = { total: 120, unread: 9 };
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

                const { finalText, actual } = await runAssistantChat({
                  emailAccount: cloneEmailAccountForProvider(
                    emailAccount,
                    provider,
                  ),
                  inboxStats,
                  messages,
                });

                const judge = finalText
                  ? await judgeEvalOutput({
                      criterion: {
                        name: "Summarizes email content",
                        description:
                          "PASS only if, for the substantive emails, the response tells the user what the email actually says: its concrete content such as the specific ask, news, amount, or deadline (for example, a sponsorship offer with a dollar amount, a payout that cleared, or specific metrics). FAIL if the per-email text only restates what to do with it or which triage group it belongs to (for example, 'worth deciding whether to reply', 'product update, probably not urgent', or 'safe to archive') without conveying the email's actual content. Sorting emails into groups is fine and expected; the failure is summaries that describe only the recommended action or priority and never the substance of the message.",
                      },
                      input: messages[0].content,
                      output: finalText,
                    })
                  : null;

                return {
                  pass: !!judge?.pass,
                  actual:
                    judge && finalText
                      ? `${actual} | ${formatSemanticJudgeActual(finalText, judge)}`
                      : `no assistant text | ${actual}`,
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
