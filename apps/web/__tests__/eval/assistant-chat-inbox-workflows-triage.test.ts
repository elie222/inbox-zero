import { afterAll, describe, expect, test } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getMockMessage } from "@/__tests__/helpers";
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

const evalReporter = createEvalReporter();

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
            mockSearchMessages.mockResolvedValueOnce({
              messages: [
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
              ],
              nextPageToken: undefined,
            });

            const { toolCalls, actual } = await runAssistantChat({
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                provider,
              ),
              inboxStats: { total: 240, unread: 18 },
              messages: [
                {
                  role: "user",
                  content: "Help me handle my inbox today.",
                },
              ],
            });

            const searchCall = getFirstSearchInboxCall(toolCalls);

            const pass =
              !!searchCall &&
              hasSearchBeforeFirstWrite(toolCalls) &&
              hasUnreadTriageSignal(searchCall.query, provider, unreadSignal) &&
              hasNoWriteToolCalls(toolCalls);

            evalReporter.record({
              testName: `inbox update uses triage search first (${label})`,
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
            mockSearchMessages.mockResolvedValueOnce({
              messages: [
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
                  content: "Do I need to reply to any mail?",
                },
              ],
            });

            const searchCall = getFirstSearchInboxCall(toolCalls);

            const pass =
              !!searchCall &&
              hasSearchBeforeFirstWrite(toolCalls) &&
              hasReplyTriageFocus(searchCall.query, provider) &&
              hasNoWriteToolCalls(toolCalls);

            evalReporter.record({
              testName: `reply triage stays read-only (${label})`,
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
