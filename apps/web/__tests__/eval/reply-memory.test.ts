import { afterAll, describe, expect, test, vi } from "vitest";
import { getEmail } from "@/__tests__/helpers";
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
import { aiDraftReplyWithConfidence } from "@/utils/ai/reply/draft-reply";
import { aiExtractReplyMemoriesFromDraftEdit } from "@/utils/ai/reply/reply-memory";

// pnpm test-ai eval/reply-memory
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/reply-memory

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 180_000;
const evalReporter = createEvalReporter();

describe.runIf(shouldRunEval)("reply memory eval", () => {
  describeEvalMatrix("reply memory", (model, emailAccount) => {
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

    test(
      "improves a pricing draft when a learned reply memory is available",
      async () => {
        const messages = [
          {
            ...getEmail({
              from: "buyer@example.com",
              to: emailAccount.email,
              subject: "Pricing follow-up",
              content: `Hi,

We lost your earlier pricing note.

Can you resend the short enterprise pricing explanation you usually send for a 30 person team, and mention whether annual billing changes the quote?`,
            }),
            date: new Date("2026-03-17T10:00:00Z"),
          },
        ];

        const withoutMemory = await aiDraftReplyWithConfidence({
          messages,
          emailAccount,
          knowledgeBaseContent: null,
          replyMemoryContent: null,
          emailHistorySummary: null,
          emailHistoryContext: null,
          calendarAvailability: null,
          writingStyle: null,
          mcpContext: null,
          meetingContext: null,
        });

        const replyMemoryContent =
          "1. [FACT | TOPIC:pricing] When asked about enterprise pricing, explain that it depends on seat count and whether the customer wants annual billing.";

        const withMemory = await aiDraftReplyWithConfidence({
          messages,
          emailAccount,
          knowledgeBaseContent: null,
          replyMemoryContent,
          emailHistorySummary: null,
          emailHistoryContext: null,
          calendarAvailability: null,
          writingStyle: null,
          mcpContext: null,
          meetingContext: null,
        });

        const hasExpectedCorrection =
          /seat count/i.test(withMemory.reply) &&
          /annual billing/i.test(withMemory.reply);
        const avoidsUnsupportedNumericPricing =
          !/\$\d|\d+\s*(per (seat|user|month)|users?)|discount/i.test(
            withMemory.reply,
          );

        const judgeResult = await judgeBinary({
          input: buildDraftComparisonInput({
            emailContent: messages[0].content,
            withoutMemoryReply: withoutMemory.reply,
            replyMemoryContent,
          }),
          output: withMemory.reply,
          expected:
            "A concise professional reply that explains enterprise pricing depends on seat count and whether the customer wants annual billing, without inventing unsupported numeric prices, per-seat quotes, or discount claims.",
          criterion: {
            name: "Learned memory improves draft generation",
            description:
              "Compared with the no-memory draft, the memory-aware draft should correctly apply the learned pricing guidance from the provided reply memory and be more grounded by avoiding unsupported numeric pricing claims or discount details that were never provided.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass =
          hasExpectedCorrection &&
          avoidsUnsupportedNumericPricing &&
          judgeResult.pass;

        evalReporter.record({
          testName: "pricing memory improves draft",
          model: model.label,
          pass,
          expected:
            "memory-aware draft uses seat-count and annual-billing guidance",
          actual: formatDraftComparisonActual({
            withoutMemoryReply: withoutMemory.reply,
            withMemoryReply: withMemory.reply,
            judgeResult,
          }),
          criteria: [judgeResult],
        });

        expect(hasExpectedCorrection).toBe(true);
        expect(avoidsUnsupportedNumericPricing).toBe(true);
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

function buildDraftComparisonInput({
  emailContent,
  withoutMemoryReply,
  replyMemoryContent,
}: {
  emailContent: string;
  withoutMemoryReply: string;
  replyMemoryContent: string;
}) {
  return [
    "## Current Email",
    emailContent,
    "",
    "## Reply Without Learned Memory",
    withoutMemoryReply,
    "",
    "## Learned Reply Memory",
    replyMemoryContent,
  ].join("\n");
}

function formatJudgeActual(
  summary: string,
  judgeResult: { pass: boolean; reasoning: string },
) {
  return `${summary}; judge=${judgeResult.pass ? "PASS" : "FAIL"} (${judgeResult.reasoning})`;
}

function formatDraftComparisonActual({
  withoutMemoryReply,
  withMemoryReply,
  judgeResult,
}: {
  withoutMemoryReply: string;
  withMemoryReply: string;
  judgeResult: { pass: boolean; reasoning: string };
}) {
  return [
    `without=${JSON.stringify(withoutMemoryReply)}`,
    `with=${JSON.stringify(withMemoryReply)}`,
    `judge=${judgeResult.pass ? "PASS" : "FAIL"} (${judgeResult.reasoning})`,
  ].join(" | ");
}

function getEvalJudgeUserAi() {
  if (!process.env.OPENROUTER_API_KEY) return undefined;

  return {
    aiProvider: "openrouter",
    aiModel: "google/gemini-3.1-flash-lite-preview",
    aiApiKey: process.env.OPENROUTER_API_KEY,
  };
}
