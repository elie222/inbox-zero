import type { ModelMessage } from "ai";
import { afterAll, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import { buildResolvedSystemPrompt } from "@/utils/ai/assistant/chat";
import { createFinalReplyStep } from "@/utils/ai/assistant/final-reply-step";
import { toolCallAgentStream } from "@/utils/llms";
import { LlmUseCase } from "@/utils/llms/use-cases";

// pnpm test-ai eval/assistant-chat-final-reply-step
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-final-reply-step

vi.mock("server-only", () => ({}));

const TIMEOUT = 90_000;

const evalReporter = createEvalReporter({
  evalName: "assistant-chat-final-reply-step",
});

describe.runIf(shouldRunEvalTests())(
  "Eval: assistant chat final reply step",
  () => {
    describeEvalMatrix(
      "assistant-chat final reply step",
      (model, emailAccount) => {
        test(
          "summarizes a long tool loop that ended without a reply",
          async () => {
            const finalReply = createFinalReplyStep();

            const result = await toolCallAgentStream({
              userAi: emailAccount.user,
              userId: emailAccount.userId,
              emailAccountId: emailAccount.id,
              userEmail: emailAccount.email,
              useCase: LlmUseCase.AssistantChat,
              usageLabel: "eval-assistant-chat-final-reply-step",
              promptHardening: { trust: "untrusted", level: "full" },
              messages: buildMessages(),
              tools: {},
              stopWhen: () => false,
              // Steers before the first step, so the request reaches it as it
              // would after a step that ended without text.
              createSteering: () => {
                const steering = finalReply.createSteering();
                finalReply.onStepEnd({ text: "", toolCalls: [] });
                return steering;
              },
              prepareStep: ({ experimental_steeringMessages }) =>
                finalReply.isFinalReplyStep(experimental_steeringMessages)
                  ? { activeTools: [], toolChoice: "none" }
                  : undefined,
            });
            const finalText = (await result.text).trim();

            const judgeResult = await judgeEvalOutput({
              input: [
                "The user asked the assistant to archive every newsletter in their inbox.",
                'The assistant searched with the query "newsletters" across two result pages and found 40 threads, from news1@example.com through news40@example.com in order.',
                "It archived them in two batches: the first archived threads 1-20; the second archived threads 21-37 and failed for threads 38-40.",
                "Its last step ended without any reply to the user, so it was asked to reply now, without tools.",
              ].join("\n"),
              output: finalText,
              expected:
                "A short user-facing reply that says about 37 newsletters were archived and 3 could not be, without claiming everything was archived, inventing other actions, or mentioning internal notes or instructions.",
              criterion: {
                name: "Accurate final summary",
                description:
                  "The reply is visible text addressed to the user that accurately reports the outcome of the earlier tool calls (succeeded and failed work), does not claim actions that did not happen, and does not talk about hidden notes, the app, or being asked to summarize.",
              },
            });

            const pass = finalText.length > 0 && judgeResult.pass;
            evalReporter.record({
              testName: "summarizes a tool loop that ended without a reply",
              model: model.label,
              pass,
              actual: formatSemanticJudgeActual(finalText, judgeResult),
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

function buildMessages(): ModelMessage[] {
  const system = buildResolvedSystemPrompt({
    emailSendToolsEnabled: false,
    draftReplyActionsEnabled: false,
    webhookActionsEnabled: false,
    calendarConnection: { state: "disconnected" },
    provider: "google",
    responseSurface: "web",
    supportsInlineEmailCards: false,
    userTimezone: "UTC",
    currentTimestamp: "2026-11-08T10:00:00.000Z",
  });
  const threadIds = Array.from({ length: 40 }, (_, i) => `thread-${i + 1}`);

  return [
    { role: "system", content: system },
    { role: "user", content: "Archive all the newsletters in my inbox." },
    toolCall("call-search-1", "searchInbox", { query: "newsletters" }),
    toolResult(
      "call-search-1",
      "searchInbox",
      searchPage(threadIds, 0, "page-2"),
    ),
    toolCall("call-search-2", "searchInbox", { nextPageToken: "page-2" }),
    toolResult("call-search-2", "searchInbox", searchPage(threadIds, 20)),
    toolCall("call-archive-1", "manageInbox", {
      action: "archive_threads",
      threadIds: threadIds.slice(0, 20),
    }),
    toolResult("call-archive-1", "manageInbox", {
      success: true,
      successCount: 20,
      failedCount: 0,
    }),
    toolCall("call-archive-2", "manageInbox", {
      action: "archive_threads",
      threadIds: threadIds.slice(20),
    }),
    toolResult("call-archive-2", "manageInbox", {
      success: false,
      successCount: 17,
      failedCount: 3,
      failedThreadIds: threadIds.slice(37),
    }),
  ];
}

function toolCall(
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
): ModelMessage {
  return {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId, toolName, input }],
  };
}

function toolResult(
  toolCallId: string,
  toolName: string,
  value: Record<string, unknown>,
): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId,
        toolName,
        output: { type: "json", value: value as never },
      },
    ],
  };
}

function searchPage(
  threadIds: string[],
  start: number,
  nextPageToken?: string,
) {
  const messages = threadIds.slice(start, start + 20).map((threadId, i) => ({
    threadId,
    from: `news${start + i + 1}@example.com`,
    subject: `Weekly newsletter ${start + i + 1}`,
  }));
  return {
    messages,
    totalReturned: messages.length,
    nextPageToken,
    hasMore: Boolean(nextPageToken),
  };
}
