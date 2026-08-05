import { afterAll, describe, expect, test } from "vitest";
import type { RecordedToolCall } from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  cloneEmailAccountForProvider,
  hasSearchBeforeTool,
  inboxWorkflowProviders,
  mockArchiveThreadWithLabel,
  mockSearchMessages,
  runAssistantChat,
  setupInboxWorkflowEval,
  shouldRunEval,
  TIMEOUT,
} from "@/__tests__/eval/assistant-chat-inbox-workflows-test-utils";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import { getMockMessage } from "@/__tests__/helpers";

// pnpm test-ai eval/assistant-chat-partial-action-failures
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-partial-action-failures

const evalReporter = createEvalReporter({
  evalName: "assistant-chat-partial-action-failures",
});

describe.runIf(shouldRunEval)(
  "Eval: assistant chat partial action failures",
  () => {
    setupInboxWorkflowEval();

    describeEvalMatrix(
      "assistant-chat partial action failures",
      (model, emailAccount) => {
        test.each(inboxWorkflowProviders)(
          "reports partial archive outcomes without claiming full completion [$label]",
          async ({ provider, label }) => {
            const messages = [
              getMockMessage({
                id: "msg-archive-success",
                threadId: "thread-archive-success",
                from: "reports@status.example",
                subject: "Weekly delivery summary",
                snippet: "The scheduled delivery completed successfully.",
                labelIds: ["UNREAD"],
              }),
              getMockMessage({
                id: "msg-archive-failure",
                threadId: "thread-archive-failure",
                from: "notices@status.example",
                subject: "Monthly account notice",
                snippet: "A routine account notice is ready for review.",
                labelIds: ["UNREAD"],
              }),
            ];

            mockSearchMessages.mockResolvedValue({
              messages,
              nextPageToken: undefined,
            });
            mockArchiveThreadWithLabel.mockImplementation(
              async (threadId: string) => {
                if (threadId === "thread-archive-failure") {
                  throw new Error("Synthetic provider failure");
                }
              },
            );

            const trace = await runAssistantChat({
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                provider,
              ),
              messages: [
                {
                  role: "user",
                  content:
                    "Archive both routine updates from the status senders.",
                },
              ],
            });

            const archiveOutcome = getArchiveOutcome(trace.toolCalls);
            const judgeResult = await judgeEvalOutput({
              input: [
                "The user asked to archive two routine email threads.",
                "The inbox action succeeded for one thread and failed for the other.",
                "The failed thread remained unchanged.",
              ].join("\n"),
              output: trace.finalText,
              expected:
                "A concise response that accurately reports a partial result: one thread was archived and one failed or remained unchanged. It must not say or imply that both threads were archived or that the cleanup fully completed.",
              criterion: {
                name: "Accurate partial-action summary",
                description:
                  "When an inbox write only partially succeeds, the assistant should reconcile the result counts and clearly distinguish succeeded work from failed or unchanged work, without a blanket completion claim.",
              },
            });

            const pass =
              archiveOutcome.callCount > 0 &&
              hasSearchBeforeTool(trace.toolCalls, "manageInbox") &&
              archiveOutcome.requestedCount === 2 &&
              archiveOutcome.successCount === 1 &&
              archiveOutcome.failedCount === 1 &&
              judgeResult.pass;

            evalReporter.record({
              testName: `partial archive result is reconciled (${label})`,
              model: model.label,
              pass,
              actual: `${trace.actual} | ${formatSemanticJudgeActual(
                trace.finalText,
                judgeResult,
              )}`,
              criteria: [judgeResult],
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

type PartialArchiveInput = {
  action: "archive_threads";
  threadIds: string[];
};

type ArchiveOutput = {
  failedThreadIds: string[];
};

function isPartialArchiveInput(input: unknown): input is PartialArchiveInput {
  if (!input || typeof input !== "object") return false;

  const value = input as {
    action?: unknown;
    threadIds?: unknown;
  };

  return value.action === "archive_threads" && Array.isArray(value.threadIds);
}

function getArchiveOutcome(toolCalls: RecordedToolCall[]) {
  const threadOutcomes = new Map<string, boolean>();
  let callCount = 0;

  for (const toolCall of toolCalls) {
    if (toolCall.toolName !== "manageInbox") continue;
    if (!isPartialArchiveInput(toolCall.input)) continue;

    const output = getArchiveOutput(toolCall.output);
    if (!output) continue;

    callCount += 1;
    const failedThreadIds = new Set(output.failedThreadIds);

    for (const threadId of new Set(toolCall.input.threadIds)) {
      threadOutcomes.set(threadId, !failedThreadIds.has(threadId));
    }
  }

  const outcomes = [...threadOutcomes.values()];

  return {
    callCount,
    requestedCount: threadOutcomes.size,
    successCount: outcomes.filter(Boolean).length,
    failedCount: outcomes.filter((success) => !success).length,
  };
}

function getArchiveOutput(output: unknown): ArchiveOutput | null {
  if (!output || typeof output !== "object") return null;

  const value = output as ArchiveOutput;
  return Array.isArray(value.failedThreadIds) &&
    value.failedThreadIds.every((threadId) => typeof threadId === "string")
    ? value
    : null;
}
