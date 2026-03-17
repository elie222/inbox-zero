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
  hasSearchBeforeTool,
  inboxWorkflowProviders,
  isReadEmailInput,
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
  "Eval: assistant chat inbox workflows search",
  () => {
    setupInboxWorkflowEval();

    describeEvalMatrix(
      "assistant-chat inbox workflows search",
      (model, emailAccount) => {
        test.each(inboxWorkflowProviders)(
          "uses inbox search for direct email lookup requests [$label]",
          async ({ provider, label }) => {
            mockSearchMessages.mockResolvedValueOnce({
              messages: [
                getMockMessage({
                  id: "msg-search-1",
                  threadId: "thread-search-1",
                  from: "support@smtprelay.example",
                  subject: "SMTP relay API setup guide",
                  snippet:
                    "Here are the connection details for your API client.",
                  labelIds: ["UNREAD"],
                }),
                getMockMessage({
                  id: "msg-search-2",
                  threadId: "thread-search-2",
                  from: "billing@smtprelay.example",
                  subject: "Receipt for your SMTP relay subscription",
                  snippet: "Your monthly invoice is attached.",
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
                    "Find me an email related to setting up the SMTP relay API.",
                },
              ],
            });

            const searchCall = getFirstSearchInboxCall(toolCalls);
            const searchJudge = searchCall
              ? await judgeSearchInboxQuery({
                  prompt:
                    "Find me an email related to setting up the SMTP relay API.",
                  query: searchCall.query,
                  expected:
                    "A search query focused on the SMTP relay API setup email.",
                })
              : null;

            const pass =
              !!searchCall &&
              !!searchJudge?.pass &&
              hasSearchBeforeFirstWrite(toolCalls) &&
              hasNoWriteToolCalls(toolCalls);

            evalReporter.record({
              testName: `direct email lookup uses search (${label})`,
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
          "reads the full email after search when the user asks what a message says [$label]",
          async ({ provider, label }) => {
            mockSearchMessages.mockResolvedValueOnce({
              messages: [
                getMockMessage({
                  id: "msg-read-1",
                  threadId: "thread-read-1",
                  from: "ops@partner.example",
                  subject: "Question on the revised plan",
                  snippet: "Can you confirm the revised timeline?",
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
                    "What does the email about the revised plan say? I need the full contents.",
                },
              ],
            });

            const searchCall = getFirstSearchInboxCall(toolCalls);
            const searchJudge = searchCall
              ? await judgeSearchInboxQuery({
                  prompt:
                    "What does the email about the revised plan say? I need the full contents.",
                  query: searchCall.query,
                  expected:
                    "A search query focused on the email about the revised plan.",
                })
              : null;
            const readCall = getLastMatchingToolCall(
              toolCalls,
              "readEmail",
              isReadEmailInput,
            )?.input;

            const pass =
              !!searchCall &&
              !!readCall &&
              !!searchJudge?.pass &&
              hasSearchBeforeTool(toolCalls, "readEmail") &&
              readCall.messageId === "msg-read-1" &&
              hasNoWriteToolCalls(toolCalls);

            evalReporter.record({
              testName: `search then read full email (${label})`,
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
