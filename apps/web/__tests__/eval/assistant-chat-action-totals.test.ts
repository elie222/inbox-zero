import type { ModelMessage } from "ai";
import { afterAll, describe, expect, test } from "vitest";
import {
  setupInboxWorkflowEval,
  shouldRunEval,
} from "@/__tests__/eval/assistant-chat-inbox-workflows-test-utils";
import {
  captureAssistantChatTrace,
  summarizeRecordedToolCalls,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import { compactMessages } from "@/utils/ai/assistant/compact";
import { createScopedLogger } from "@/utils/logger";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-action-totals.test.ts
// Multi-model: EVAL_MODELS=all pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-action-totals.test.ts

const TIMEOUT = 300_000;
const logger = createScopedLogger("eval-assistant-chat-action-totals");
const evalReporter = createEvalReporter({
  evalName: "assistant-chat-action-totals",
});

// Uneven batch sizes, so the total cannot be read off one batch or guessed by
// multiplying the batch count.
const ARCHIVE_BATCH_SIZES = Array.from(
  { length: 64 },
  (_, index) => [25, 25, 25, 23, 25, 19, 25, 24][index % 8],
);
const TRASH_BATCH_SIZES = [12, 10, 8];
const ARCHIVED_TOTAL = ARCHIVE_BATCH_SIZES.reduce((sum, size) => sum + size);
const TRASHED_TOTAL = TRASH_BATCH_SIZES.reduce((sum, size) => sum + size);
const TRASH_AFTER_ARCHIVE_BATCH = 30;

describe.runIf(shouldRunEval)(
  "Eval: assistant chat reports totals after a long cleanup",
  () => {
    setupInboxWorkflowEval();

    describeEvalMatrix(
      "assistant-chat action totals",
      (model, emailAccount) => {
        test(
          "reports the whole cleanup from the latest tool result, without compaction",
          async () => {
            await runScenario({
              testName: "totals, uncompacted",
              compact: false,
              model: model.label,
              emailAccount,
              messages: [
                ...buildCleanupTurn(),
                {
                  role: "user",
                  content:
                    "Nice. How many emails did you archive and how many did you delete in total?",
                },
              ],
            });
          },
          TIMEOUT,
        );

        test(
          "reports the whole cleanup right after the cleanup turn was compacted",
          async () => {
            await runScenario({
              testName: "totals after compaction",
              compact: true,
              model: model.label,
              emailAccount,
              messages: [
                ...buildCleanupTurn(),
                {
                  role: "user",
                  content:
                    "Nice. How many emails did you archive and how many did you delete in total?",
                },
              ],
            });
          },
          TIMEOUT,
        );

        test(
          "reports the whole cleanup after compaction and an unrelated turn",
          async () => {
            await runScenario({
              testName: "totals after compaction and unrelated turn",
              compact: true,
              model: model.label,
              emailAccount,
              messages: [
                ...buildCleanupTurn(),
                ...buildUnrelatedTurn(),
                {
                  role: "user",
                  content:
                    "Back to the cleanup: how many emails did you archive and how many did you delete in total?",
                },
              ],
            });
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

async function runScenario({
  testName,
  compact,
  model,
  emailAccount,
  messages,
}: {
  testName: string;
  compact: boolean;
  model: string;
  emailAccount: Parameters<typeof captureAssistantChatTrace>[0]["emailAccount"];
  messages: ModelMessage[];
}) {
  let modelMessages = messages;
  if (compact) {
    const compaction = await compactMessages({
      messages,
      actionTotals: {
        threads_archived: ARCHIVED_TOTAL,
        threads_trashed: TRASHED_TOTAL,
      },
      user: emailAccount,
      logger,
    });
    expect(compaction.compactedCount).toBeGreaterThan(0);
    modelMessages = compaction.compactedMessages;
  }

  const trace = await captureAssistantChatTrace({
    messages: modelMessages,
    emailAccount,
    logger,
  });

  const expected = `${ARCHIVED_TOTAL} emails archived and ${TRASHED_TOTAL} deleted across the whole cleanup`;
  const judge = await judgeEvalOutput({
    input: `Over a long cleanup the assistant archived emails in ${ARCHIVE_BATCH_SIZES.length} batches and deleted emails in ${TRASH_BATCH_SIZES.length} batches. The user then asked how many it archived and deleted in total.`,
    output: trace.finalText,
    expected,
    criterion: {
      name: "Accurate cleanup totals",
      description: `The answer gives ${ARCHIVED_TOTAL} as the number archived and ${TRASHED_TOTAL} as the number deleted or trashed (any number formatting is fine). It fails if it reports only the most recent batch or batches, gives a different number, or says the total is unknown.`,
    },
  });

  evalReporter.record({
    testName,
    model,
    pass: judge.pass,
    actual: [
      formatSemanticJudgeActual(trace.finalText, judge),
      summarizeRecordedToolCalls(
        trace.toolCalls,
        (toolCall) => toolCall.toolName,
      ),
    ].join(" | "),
  });

  expect(judge.pass, trace.finalText).toBe(true);
}

function buildCleanupTurn(): ModelMessage[] {
  const rounds: ModelMessage[] = [];
  const totals = { threads_archived: 0, threads_trashed: 0 };

  ARCHIVE_BATCH_SIZES.forEach((size, batch) => {
    totals.threads_archived += size;
    rounds.push(
      ...manageInboxRound({
        toolCallId: `archive-${batch}`,
        action: "archive_threads",
        threadIds: threadIds(`promo-${batch}`, size),
        totals,
      }),
    );

    if (batch === TRASH_AFTER_ARCHIVE_BATCH) {
      rounds.push({
        role: "user",
        content:
          "While you're at it, delete the spam from those fake prize senders.",
      });
      TRASH_BATCH_SIZES.forEach((trashSize, trashBatch) => {
        totals.threads_trashed += trashSize;
        rounds.push(
          ...manageInboxRound({
            toolCallId: `trash-${trashBatch}`,
            action: "trash_threads",
            threadIds: threadIds(`spam-${trashBatch}`, trashSize),
            totals,
          }),
        );
      });
      rounds.push({
        role: "assistant",
        content: "Deleted the spam. Continuing with the promotions.",
      });
      rounds.push({ role: "user", content: "Great, keep going." });
    }
  });

  return [
    {
      role: "user",
      content:
        "Archive all the promotional emails in my inbox. There are a lot, so keep going until they're all done.",
    },
    ...rounds,
    {
      role: "assistant",
      content:
        "Done. All the promotional emails are out of your inbox, and the spam is deleted.",
    },
  ];
}

function buildUnrelatedTurn(): ModelMessage[] {
  return [
    { role: "user", content: "Did Dana send the Q3 budget yet?" },
    ...toolRound("search-dana", "searchInbox", {
      input: { query: "from:dana budget" },
      output: {
        queryUsed: "from:dana budget",
        totalReturned: 1,
        hasMore: false,
        messages: [
          {
            messageId: "msg-dana-1",
            threadId: "thread-dana-1",
            subject: "Q3 budget draft",
            from: "dana@company.example",
            snippet: "Here's the Q3 budget draft for review.",
            date: "2026-11-09T15:00:00.000Z",
            isUnread: true,
          },
        ],
      },
    }),
    {
      role: "assistant",
      content:
        'Yes. Dana sent "Q3 budget draft" yesterday afternoon, and it is still unread.',
    },
  ];
}

function manageInboxRound({
  toolCallId,
  action,
  threadIds,
  totals,
}: {
  toolCallId: string;
  action: "archive_threads" | "trash_threads";
  threadIds: string[];
  totals: Record<string, number>;
}) {
  return toolRound(toolCallId, "manageInbox", {
    input: { action, threadIds },
    output: {
      success: true,
      action,
      requestedCount: threadIds.length,
      successCount: threadIds.length,
      failedCount: 0,
      failedThreadIds: [],
      totalsInThisChat: Object.fromEntries(
        Object.entries(totals).filter(([, count]) => count > 0),
      ),
    },
  });
}

function toolRound(
  toolCallId: string,
  toolName: string,
  { input, output }: { input: Record<string, unknown>; output: unknown },
): ModelMessage[] {
  return [
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId, toolName, input }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId,
          toolName,
          output: { type: "json", value: JSON.parse(JSON.stringify(output)) },
        },
      ],
    },
  ];
}

function threadIds(prefix: string, count: number) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${index.toString(36).padStart(4, "0")}`,
  );
}
