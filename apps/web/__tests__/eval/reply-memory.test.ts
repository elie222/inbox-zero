import { afterAll, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { judgeBinary } from "@/__tests__/eval/judge";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import { aiExtractReplyMemoriesFromDraftEdit } from "@/utils/ai/reply/reply-memory";

// pnpm test-ai eval/reply-memory
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/reply-memory

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 120_000;
const evalReporter = createEvalReporter();

describe.runIf(shouldRunEval)("reply memory extraction eval", () => {
  describeEvalMatrix("reply memory extraction", (model, emailAccount) => {
    test(
      "extracts a reusable factual pricing memory",
      async () => {
        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount,
          incomingEmailContent:
            "Can you share your pricing for a 30 person team and let me know whether annual billing changes the quote?",
          draftText:
            "Thanks for reaching out. Pricing is available on our website.",
          sentText:
            "Thanks for reaching out. Our starter plan is $24 per seat per month. Enterprise pricing depends on seat count and whether they want annual billing.",
          senderEmail: "buyer@example.com",
          existingMemories: [],
        });

        const hasExpectedStructure =
          result.length > 0 &&
          result.length <= 3 &&
          result.some(
            (memory) =>
              memory.kind === ReplyMemoryKind.FACT &&
              (memory.scopeType === ReplyMemoryScopeType.TOPIC ||
                memory.scopeType === ReplyMemoryScopeType.GLOBAL),
          );
        const summary = summarizeMemories(result);
        const judgeResult = await judgeBinary({
          input: buildJudgeInput({
            incomingEmailContent:
              "Can you share your pricing for a 30 person team and let me know whether annual billing changes the quote?",
            draftText:
              "Thanks for reaching out. Pricing is available on our website.",
            sentText:
              "Thanks for reaching out. Our starter plan is $24 per seat per month. Enterprise pricing depends on seat count and whether they want annual billing.",
          }),
          output: summary,
          expected:
            "At least one reusable FACT memory that captures durable pricing guidance from the edit, such as seat-count-based pricing or annual-billing pricing considerations.",
          criterion: {
            name: "Reusable factual memory extraction",
            description:
              "The extracted memories should include a reusable factual memory grounded in the edit. It should capture durable pricing guidance rather than generic phrasing or one-off wording changes.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass = hasExpectedStructure && judgeResult.pass;

        evalReporter.record({
          testName: "pricing fact extraction",
          model: model.label,
          pass,
          expected: "FACT memory about seat-count-based pricing",
          actual: formatJudgeActual(summary, judgeResult),
          criteria: [judgeResult],
        });

        expect(hasExpectedStructure).toBe(true);
        expect(judgeResult.pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "does not learn from a one-off scheduling edit",
      async () => {
        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount,
          incomingEmailContent:
            "Would Tuesday or Wednesday afternoon work for a quick call next week?",
          draftText: "Happy to chat. I am free any time next week.",
          sentText: "Happy to chat. Thursday at 2pm works best for me.",
          senderEmail: "partner@example.com",
          existingMemories: [],
        });

        const pass = result.length === 0;

        evalReporter.record({
          testName: "one-off scheduling edit ignored",
          model: model.label,
          pass,
          expected: "no memory",
          actual: summarizeMemories(result),
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "extracts a concise style memory from repeated tone edits",
      async () => {
        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount,
          incomingEmailContent:
            "Thanks for the quick follow-up. Just confirming you got my note.",
          draftText:
            "Hi there! Thanks so much for checking in! I just wanted to let you know that I received your message and I will review it soon!",
          sentText: "Got it. I will review and get back to you.",
          senderEmail: "colleague@example.com",
          existingMemories: [],
        });

        const hasExpectedStructure = result.some(
          (memory) => memory.kind === ReplyMemoryKind.STYLE,
        );
        const summary = summarizeMemories(result);
        const judgeResult = await judgeBinary({
          input: buildJudgeInput({
            incomingEmailContent:
              "Thanks for the quick follow-up. Just confirming you got my note.",
            draftText:
              "Hi there! Thanks so much for checking in! I just wanted to let you know that I received your message and I will review it soon!",
            sentText: "Got it. I will review and get back to you.",
          }),
          output: summary,
          expected:
            "A reusable STYLE memory that captures the user's preference for concise, low-enthusiasm replies rather than this one specific sentence.",
          criterion: {
            name: "Reusable style memory extraction",
            description:
              "The extracted memories should include a reusable style preference grounded in the edit, such as preferring concise or less enthusiastic replies. The memory should describe a durable communication preference, not restate the specific sentence.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass = hasExpectedStructure && judgeResult.pass;

        evalReporter.record({
          testName: "concise style extraction",
          model: model.label,
          pass,
          expected: "STYLE memory about concise replies",
          actual: formatJudgeActual(summary, judgeResult),
          criteria: [judgeResult],
        });

        expect(hasExpectedStructure).toBe(true);
        expect(judgeResult.pass).toBe(true);
      },
      TIMEOUT,
    );
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function summarizeMemories(
  memories: Array<{
    title: string;
    kind: ReplyMemoryKind;
    scopeType: ReplyMemoryScopeType;
    scopeValue: string;
    content: string;
  }>,
) {
  if (!memories.length) return "none";

  return memories
    .map(
      (memory) =>
        `[${memory.kind}|${memory.scopeType}${memory.scopeValue ? `:${memory.scopeValue}` : ""}] ${memory.title}: ${memory.content}`,
    )
    .join(" || ");
}

function buildJudgeInput({
  incomingEmailContent,
  draftText,
  sentText,
}: {
  incomingEmailContent: string;
  draftText: string;
  sentText: string;
}) {
  return [
    "## Incoming Email",
    incomingEmailContent,
    "",
    "## Draft Before Edit",
    draftText,
    "",
    "## Final Sent Reply",
    sentText,
  ].join("\n");
}

function formatJudgeActual(
  summary: string,
  judgeResult: { pass: boolean; reasoning: string },
) {
  return `${summary}; judge=${judgeResult.pass ? "PASS" : "FAIL"} (${judgeResult.reasoning})`;
}

function getEvalJudgeUserAi() {
  if (!process.env.OPENROUTER_API_KEY) return undefined;

  return {
    aiProvider: "openrouter",
    aiModel: "google/gemini-3.1-flash-lite-preview",
    aiApiKey: process.env.OPENROUTER_API_KEY,
  };
}
