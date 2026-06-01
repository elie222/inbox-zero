import { afterAll, describe, expect, test, vi } from "vitest";
import { aiCollectReplyContext } from "@/utils/ai/reply/reply-context-collector";
import { aiDraftReplyWithConfidence } from "@/utils/ai/reply/draft-reply";
import { getEmail } from "@/__tests__/helpers";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";

// pnpm test-ai eval/reply-guidance-grounding

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 90_000;

describe.runIf(shouldRunEval)("reply guidance grounding eval", () => {
  const evalReporter = createEvalReporter({
    evalName: "reply-guidance-grounding",
  });

  describeEvalMatrix(
    "stale guidance vs current facts",
    (model, emailAccount) => {
      test(
        "collector does not forward historical requests for details already in the current thread",
        async () => {
          const currentThread = [
            {
              ...getEmail({
                id: "current-message",
                from: "sender@example.com",
                to: emailAccount.email,
                subject: "Automation rule still running",
                content: `Hi,

I disabled a few automation rules, but one rule is still running for the affected account member@example.com.

Can you check why it is still firing?`,
              }),
              threadId: "current-thread",
            },
          ];

          const testName = "collector ignores stale missing-info guidance";
          const record = await evalReporter.recordCached(
            {
              testName,
              model: model.label,
              cacheKeyParts: [{ model, currentThread }],
            },
            async () => {
              const provider = getProviderWithHistoricalAccountRequest();

              const result = await aiCollectReplyContext({
                currentThread,
                emailAccount,
                emailProvider: provider,
              });

              const output = JSON.stringify(result ?? {}, null, 2);
              const judgeResult = await judgeEvalOutput({
                input: JSON.stringify({ currentThread }, null, 2),
                output,
                expected:
                  "Collector output should not recommend asking for the affected account when the current thread already contains it, and should not treat a prior unresolved request for that same detail as useful drafting guidance.",
                criterion: {
                  name: "No stale missing-info guidance",
                  description:
                    "The collector may return genuinely useful historical resolution details, but it must not pass along historical context whose only value is asking the sender for information that is already present in the current thread.",
                },
              });

              return {
                pass: judgeResult.pass,
                expected: "no stale request for already-provided details",
                actual: formatSemanticJudgeActual(output, judgeResult),
              };
            },
          );

          expect(
            record.pass,
            `Collector should not forward stale missing-info guidance.\n\nActual:\n${record.actual}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "drafter treats helper guidance as advisory when the current thread has the requested detail",
        async () => {
          const messages = [
            {
              ...getEmail({
                id: "message-1",
                from: "sender@example.com",
                to: emailAccount.email,
                subject: "Automation rule still running",
                content: `Hi,

I disabled a few automation rules, but one rule is still running for the affected account member@example.com.

Can you check why it is still firing?`,
              }),
              date: new Date("2026-05-12T10:00:00Z"),
            },
          ];

          const helperContext = {
            notes:
              "In a prior unresolved thread, support asked the sender to provide the affected account before investigating.",
            relevantEmails: [
              "Support reply in a prior thread: Could you share the affected account identifier so we can look into it?",
            ],
          };

          const testName = "drafter ignores stale missing-info guidance";
          const record = await evalReporter.recordCached(
            {
              testName,
              model: model.label,
              cacheKeyParts: [{ model, messages, helperContext }],
            },
            async () => {
              const result = await aiDraftReplyWithConfidence({
                messages,
                emailAccount,
                knowledgeBaseContent: null,
                emailHistorySummary: null,
                emailHistoryContext: helperContext,
                calendarAvailability: null,
                writingStyle: null,
                mcpContext: null,
                meetingContext: null,
              });

              const judgeResult = await judgeEvalOutput({
                input: JSON.stringify(
                  {
                    currentThread: messages,
                    helperContext:
                      "A helper says prior support asked for the affected account identifier.",
                  },
                  null,
                  2,
                ),
                output: result.reply,
                expected:
                  "A concise support reply that acknowledges the issue and says the user is checking or investigating, without asking the sender to provide the affected account because the current thread already includes it.",
                criterion: {
                  name: "Current thread facts override helper guidance",
                  description:
                    "The draft must use the current email thread as the primary source of truth. It must not ask for details that are already provided in the latest email just because helper or historical context suggested asking for them.",
                },
              });

              return {
                pass: judgeResult.pass,
                expected: "does not ask for already-provided account details",
                actual: formatSemanticJudgeActual(result.reply, judgeResult),
              };
            },
          );

          expect(
            record.pass,
            `Draft should not ask for already-provided details.\n\nActual:\n${record.actual}`,
          ).toBe(true);
        },
        TIMEOUT,
      );
    },
  );

  afterAll(() => {
    evalReporter.printReport();
  });
});

function getProviderWithHistoricalAccountRequest() {
  const historicalThread = [
    getParsedMessage({
      id: "historical-message-1",
      from: "sender@example.com",
      textPlain:
        "I disabled a few automation rules, but one rule is still running. Can you check it?",
    }),
    getParsedMessage({
      id: "historical-message-2",
      from: "support@example.com",
      labelIds: ["SENT"],
      textPlain:
        "Could you share the affected account identifier so we can look into it?",
    }),
  ];

  return {
    name: "google",
    getMessagesWithPagination: vi.fn().mockResolvedValue({
      messages: [historicalThread[0]],
    }),
    getThreadMessages: vi.fn().mockResolvedValue(historicalThread),
  } as unknown as EmailProvider;
}

function getParsedMessage({
  id,
  from,
  labelIds = ["INBOX"],
  textPlain,
}: {
  id: string;
  from: string;
  labelIds?: string[];
  textPlain: string;
}): ParsedMessage {
  return {
    id,
    threadId: "historical-thread",
    historyId: "history-1",
    date: "2026-05-01T00:00:00.000Z",
    internalDate: "1777593600000",
    subject: "Automation rule still running",
    snippet: textPlain,
    textPlain,
    textHtml: "",
    labelIds,
    attachments: [],
    inline: [],
    headers: {
      from,
      to: "support@example.com",
      subject: "Automation rule still running",
      date: "2026-05-01T00:00:00.000Z",
      "message-id": `<${id}@example.com>`,
    },
  };
}
