import { afterAll, describe, expect, test, vi } from "vitest";
import { getEmail } from "@/__tests__/helpers";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { judgeBinary } from "@/__tests__/eval/judge";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getEvalJudgeUserAi } from "@/__tests__/eval/semantic-judge";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import { aiDraftReplyWithConfidence } from "@/utils/ai/reply/draft-reply";
import { aiExtractReplyMemoriesFromDraftEdit } from "@/utils/ai/reply/extract-reply-memories";
import { aiSummarizeLearnedWritingStyle } from "@/utils/ai/reply/summarize-learned-writing-style";
import { isDefined } from "@/utils/types";

// pnpm test-ai eval/reply-memory
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/reply-memory

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 180_000;
const evalReporter = createEvalReporter();

describe.runIf(shouldRunEval)("reply memory eval", () => {
  describeEvalMatrix("reply memory", (model, emailAccount) => {
    const replyMemoryEmailAccount = emailAccount as Parameters<
      typeof aiExtractReplyMemoriesFromDraftEdit
    >[0]["emailAccount"];

    test(
      "extracts a reusable factual pricing memory",
      async () => {
        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount: replyMemoryEmailAccount,
          incomingEmailContent:
            "Can you share your pricing for a 30 person team and let me know whether annual billing changes the quote?",
          draftText:
            "Thanks for reaching out. Pricing is available on our website.",
          sentText:
            "Thanks for reaching out. Our starter plan is $24 per seat per month. Enterprise pricing depends on seat count and whether they want annual billing.",
          senderEmail: "buyer@example.com",
          existingMemories: [],
        });
        const createdMemories = getCreatedMemoriesFromDecisions(result);

        const hasExpectedStructure =
          createdMemories.length > 0 &&
          createdMemories.length <= 3 &&
          createdMemories.some(
            (memory) =>
              memory.kind === ReplyMemoryKind.FACT &&
              (memory.scopeType === ReplyMemoryScopeType.TOPIC ||
                memory.scopeType === ReplyMemoryScopeType.GLOBAL),
          );
        const summary = summarizeMemories(createdMemories);
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
      "extracts a reusable procedure memory from a qualifying-step correction",
      async () => {
        const incomingEmailContent =
          "We would love a demo for our operations team next week. Do you have time on Tuesday or Wednesday?";
        const draftText =
          "Happy to do a demo next week. Here are a few times that work for me.";
        const sentText =
          "Happy to help. Before we schedule, can you share your team size and the main workflow you want to see? That will help me tailor the demo.";

        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount: replyMemoryEmailAccount,
          incomingEmailContent,
          draftText,
          sentText,
          senderEmail: "prospect@example.com",
          existingMemories: [],
        });
        const createdMemories = getCreatedMemoriesFromDecisions(result);

        const hasExpectedStructure = createdMemories.some(
          (memory) =>
            memory.kind === ReplyMemoryKind.PROCEDURE &&
            (memory.scopeType === ReplyMemoryScopeType.TOPIC ||
              memory.scopeType === ReplyMemoryScopeType.GLOBAL),
        );
        const summary = summarizeMemories(createdMemories);
        const judgeResult = await judgeBinary({
          input: buildJudgeInput({
            incomingEmailContent,
            draftText,
            sentText,
          }),
          output: summary,
          expected:
            "A reusable PROCEDURE memory that captures the pattern of asking for team size and use case before scheduling a demo.",
          criterion: {
            name: "Reusable procedure memory extraction",
            description:
              "The extracted memories should include a reusable handling pattern, not just a factual note or style preference. It should capture that demo requests should be qualified before offering times.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass = hasExpectedStructure && judgeResult.pass;

        evalReporter.record({
          testName: "demo qualification procedure extraction",
          model: model.label,
          pass,
          expected: "PROCEDURE memory about qualifying demo requests",
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
          emailAccount: replyMemoryEmailAccount,
          incomingEmailContent:
            "Would Tuesday or Wednesday afternoon work for a quick call next week?",
          draftText: "Happy to chat. I am free any time next week.",
          sentText: "Happy to chat. Thursday at 2pm works best for me.",
          senderEmail: "partner@example.com",
          existingMemories: [],
        });
        const createdMemories = getCreatedMemoriesFromDecisions(result);

        const pass = createdMemories.length === 0;

        evalReporter.record({
          testName: "one-off scheduling edit ignored",
          model: model.label,
          pass,
          expected: "no memory",
          actual: summarizeMemories(createdMemories),
        });

        expect(pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "extracts a global preference memory from a strong tone edit",
      async () => {
        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount: replyMemoryEmailAccount,
          incomingEmailContent:
            "Thanks for the quick follow-up. Just confirming you got my note.",
          draftText:
            "Hi there! Thanks so much for checking in! I just wanted to let you know that I received your message and I will review it soon!",
          sentText: "Got it. I will review and get back to you.",
          senderEmail: "colleague@example.com",
          existingMemories: [],
        });
        const createdMemories = getCreatedMemoriesFromDecisions(result);

        const hasExpectedStructure = createdMemories.some(
          (memory) =>
            memory.kind === ReplyMemoryKind.PREFERENCE &&
            memory.scopeType === ReplyMemoryScopeType.GLOBAL,
        );
        const summary = summarizeMemories(createdMemories);
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
            "A reusable PREFERENCE memory that captures the user's preference for concise, low-enthusiasm replies rather than this one specific sentence.",
          criterion: {
            name: "Reusable preference memory extraction",
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
          expected: "PREFERENCE memory about concise replies",
          actual: formatJudgeActual(summary, judgeResult),
          criteria: [judgeResult],
        });

        expect(hasExpectedStructure).toBe(true);
        expect(judgeResult.pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "returns an existing memory id when the same durable idea is already covered",
      async () => {
        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount: replyMemoryEmailAccount,
          incomingEmailContent:
            "Can you resend the short enterprise pricing explanation for a larger team?",
          draftText:
            "Thanks for reaching out. Pricing is available on our website.",
          sentText:
            "Enterprise pricing depends on seat count and whether the customer wants annual billing.",
          senderEmail: "buyer@example.com",
          existingMemories: [
            {
              id: "pricing-memory-1",
              content:
                "When asked about enterprise pricing, explain that it depends on seat count and whether the customer wants annual billing.",
              kind: ReplyMemoryKind.FACT,
              scopeType: ReplyMemoryScopeType.TOPIC,
              scopeValue: "pricing",
            },
          ],
        });

        const pass =
          result.length === 1 &&
          result[0].matchingExistingMemoryId === "pricing-memory-1" &&
          result[0].newMemory === null;

        evalReporter.record({
          testName: "existing pricing memory matched by id",
          model: model.label,
          pass,
          expected: "pricing-memory-1",
          actual: result[0]?.matchingExistingMemoryId ?? "null",
        });

        expect(pass).toBe(true);
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
        const pass = judgeResult.pass;

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

        expect(judgeResult.pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "uses a learned procedure memory to qualify demo requests before scheduling",
      async () => {
        const messages = [
          {
            ...getEmail({
              from: "prospect@example.com",
              to: emailAccount.email,
              subject: "Demo next week",
              content: `Hi,

We would love to see a demo next week for our operations team. Are you available on Tuesday or Wednesday?

Thanks,`,
            }),
            date: new Date("2026-03-17T10:30:00Z"),
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
          "1. [PROCEDURE | TOPIC:demos] When a sender asks for a demo, first ask for team size and the main workflow they want to see before offering times.";

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

        const judgeResult = await judgeBinary({
          input: buildDraftComparisonInput({
            emailContent: messages[0].content,
            withoutMemoryReply: withoutMemory.reply,
            replyMemoryContent,
          }),
          output: withMemory.reply,
          expected:
            "A concise reply that asks for team size and the main workflow before suggesting demo times.",
          criterion: {
            name: "Learned procedure guides demo qualification",
            description:
              "Compared with the no-memory draft, the memory-aware draft should follow the procedure and qualify the demo request before offering times.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass = judgeResult.pass;

        evalReporter.record({
          testName: "procedure memory improves demo reply",
          model: model.label,
          pass,
          expected:
            "memory-aware draft asks for team size and use case before scheduling",
          actual: formatDraftComparisonActual({
            withoutMemoryReply: withoutMemory.reply,
            withMemoryReply: withMemory.reply,
            judgeResult,
          }),
          criteria: [judgeResult],
        });

        expect(judgeResult.pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "summarizes repeated preference evidence into a prompt-ready learned writing style",
      async () => {
        const learnedWritingStyle = await aiSummarizeLearnedWritingStyle({
          preferenceMemoryEvidence: buildPreferenceMemoryEvidence([
            {
              title: "concise tone",
              content: "Keep replies short and remove filler.",
              draftText:
                "Hi there! Thanks so much for checking in. I just wanted to let you know that I got your note and will take a look soon.",
              sentText: "Got it. I will review and get back to you.",
            },
            {
              title: "low ceremony",
              content: "Skip greetings and sign-offs for routine replies.",
              draftText:
                "Hi! Thanks again for the follow-up. I appreciate the reminder and will send an update shortly. Best,",
              sentText: "I will send an update shortly.",
            },
            {
              title: "plain wording",
              content:
                "Prefer plain declarative phrasing over warm filler in status updates.",
              draftText:
                "I just wanted to let you know that I am still on track and hope to have more to share very soon.",
              sentText: "Still on track. I will share more soon.",
            },
          ]),
          emailAccount: replyMemoryEmailAccount,
        });

        const judgeResult = await judgeBinary({
          input: [
            "## Style Evidence",
            buildPreferenceMemoryEvidence([
              {
                title: "concise tone",
                content: "Keep replies short and remove filler.",
                draftText:
                  "Hi there! Thanks so much for checking in. I just wanted to let you know that I got your note and will take a look soon.",
                sentText: "Got it. I will review and get back to you.",
              },
              {
                title: "low ceremony",
                content: "Skip greetings and sign-offs for routine replies.",
                draftText:
                  "Hi! Thanks again for the follow-up. I appreciate the reminder and will send an update shortly. Best,",
                sentText: "I will send an update shortly.",
              },
              {
                title: "plain wording",
                content:
                  "Prefer plain declarative phrasing over warm filler in status updates.",
                draftText:
                  "I just wanted to let you know that I am still on track and hope to have more to share very soon.",
                sentText: "Still on track. I will share more soon.",
              },
            ]),
          ].join("\n"),
          output: learnedWritingStyle,
          expected:
            "A compact learned writing style summary that captures brevity, low ceremony, and plain wording without copying full email text.",
          criterion: {
            name: "Learned writing style summary quality",
            description:
              "The summary should distill repeated evidence into an account-level style guide with concise patterns and short representative edits, not raw quotes or one-off instructions.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass = judgeResult.pass;

        evalReporter.record({
          testName: "learned style summary quality",
          model: model.label,
          pass,
          expected: "prompt-ready learned writing style summary",
          actual: formatJudgeActual(learnedWritingStyle, judgeResult),
          criteria: [judgeResult],
        });

        expect(judgeResult.pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "uses learned writing style to keep a status reply terse and direct",
      async () => {
        const messages = [
          {
            ...getEmail({
              from: "teammate@example.com",
              to: emailAccount.email,
              subject: "Checking in on the deck",
              content: `Hey,

Just checking whether you had a chance to review the deck I sent over yesterday. No rush, but let me know when you get a minute.

Thanks!`,
            }),
            date: new Date("2026-03-17T11:00:00Z"),
          },
        ];

        const withoutLearnedStyle = await aiDraftReplyWithConfidence({
          messages,
          emailAccount,
          knowledgeBaseContent: null,
          replyMemoryContent: null,
          emailHistorySummary: null,
          emailHistoryContext: null,
          calendarAvailability: null,
          writingStyle: null,
          learnedWritingStyle: null,
          mcpContext: null,
          meetingContext: null,
        });

        const learnedWritingStyle = await aiSummarizeLearnedWritingStyle({
          preferenceMemoryEvidence: buildPreferenceMemoryEvidence([
            {
              title: "concise tone",
              content: "Prefer short direct acknowledgements.",
              draftText:
                "Hi there! Thanks so much for checking in. I just wanted to let you know that I received your message and I will review it soon.",
              sentText: "Got it. I will review and get back to you.",
            },
            {
              title: "low ceremony",
              content:
                "Skip greetings and sign-offs unless they add necessary context.",
              draftText:
                "Hi! Thanks again for following up. I appreciate the reminder and will send an update shortly. Best,",
              sentText: "I will send an update shortly.",
            },
            {
              title: "less enthusiasm",
              content: "Remove enthusiasm and filler from routine replies.",
              draftText:
                "Thanks so much for the nudge. I am excited to review this and will get back to you very soon.",
              sentText: "I will review this and get back to you soon.",
            },
          ]),
          emailAccount: replyMemoryEmailAccount,
        });

        const withLearnedStyle = await aiDraftReplyWithConfidence({
          messages,
          emailAccount,
          knowledgeBaseContent: null,
          replyMemoryContent: null,
          emailHistorySummary: null,
          emailHistoryContext: null,
          calendarAvailability: null,
          writingStyle: null,
          learnedWritingStyle,
          mcpContext: null,
          meetingContext: null,
        });

        const judgeResult = await judgeBinary({
          input: buildLearnedWritingStyleComparisonInput({
            emailContent: messages[0].content,
            withoutLearnedStyleReply: withoutLearnedStyle.reply,
            learnedWritingStyle,
          }),
          output: withLearnedStyle.reply,
          expected:
            "A short plainspoken reply that acknowledges the follow-up directly, avoids greeting or sign-off fluff, and stays to one or two simple sentences.",
          criterion: {
            name: "Learned writing style guides terse replies",
            description:
              "Compared with the no-style baseline, the draft with learned writing style should be more direct and lower ceremony, without adding greeting or sign-off filler.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass = judgeResult.pass;

        evalReporter.record({
          testName: "learned style makes status reply terse",
          model: model.label,
          pass,
          expected: "short direct reply with low ceremony",
          actual: formatLearnedWritingStyleActual({
            withoutLearnedStyleReply: withoutLearnedStyle.reply,
            withLearnedStyleReply: withLearnedStyle.reply,
            judgeResult,
          }),
          criteria: [judgeResult],
        });

        expect(judgeResult.pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "keeps learned writing style advisory when factual guidance is also present",
      async () => {
        const messages = [
          {
            ...getEmail({
              from: "buyer@example.com",
              to: emailAccount.email,
              subject: "Quick pricing recap",
              content: `Hi,

Can you resend the short enterprise pricing summary for our team and confirm whether annual billing changes the quote?

Thanks,`,
            }),
            date: new Date("2026-03-17T12:00:00Z"),
          },
        ];

        const learnedWritingStyle = await aiSummarizeLearnedWritingStyle({
          preferenceMemoryEvidence: buildPreferenceMemoryEvidence([
            {
              title: "compact replies",
              content: "Keep routine replies compact and direct.",
              draftText:
                "Hi there, thanks for your note. I just wanted to circle back and let you know that I can send over the summary shortly.",
              sentText: "I can send the summary shortly.",
            },
            {
              title: "plain wording",
              content:
                "Prefer plain declarative wording over polished framing.",
              draftText:
                "I wanted to reach back out with a quick note to confirm the enterprise pricing details for your review.",
              sentText: "Here are the enterprise pricing details.",
            },
            {
              title: "skip extra ceremony",
              content:
                "Avoid greetings and sign-offs when they are not needed.",
              draftText:
                "Hi! Thanks again for your patience. I appreciate it and wanted to share the pricing recap below. Best,",
              sentText:
                "Enterprise pricing depends on seat count and annual billing.",
            },
          ]),
          emailAccount: replyMemoryEmailAccount,
        });

        const replyMemoryContent =
          "1. [FACT | TOPIC:pricing] When asked about enterprise pricing, explain that it depends on seat count and whether the customer wants annual billing.";

        const result = await aiDraftReplyWithConfidence({
          messages,
          emailAccount,
          knowledgeBaseContent: null,
          replyMemoryContent,
          emailHistorySummary: null,
          emailHistoryContext: null,
          calendarAvailability: null,
          writingStyle: null,
          learnedWritingStyle,
          mcpContext: null,
          meetingContext: null,
        });

        const judgeResult = await judgeBinary({
          input: [
            "## Current Email",
            messages[0].content,
            "",
            "## Learned Writing Style",
            learnedWritingStyle,
            "",
            "## Learned Reply Memory",
            replyMemoryContent,
          ].join("\n"),
          output: result.reply,
          expected:
            "A concise reply that still includes the factual pricing guidance that enterprise pricing depends on seat count and whether the customer wants annual billing.",
          criterion: {
            name: "Style stays advisory beside factual guidance",
            description:
              "The learned writing style should make the reply shorter and more direct, but it must not suppress the factual pricing guidance supplied by the learned reply memory.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass = judgeResult.pass;

        evalReporter.record({
          testName: "learned style remains advisory",
          model: model.label,
          pass,
          expected: "concise reply that still includes pricing facts",
          actual: formatJudgeActual(result.reply, judgeResult),
          criteria: [judgeResult],
        });

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
    title?: string;
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
        `[${memory.kind}|${memory.scopeType}${memory.scopeValue ? `:${memory.scopeValue}` : ""}] ${memory.content}`,
    )
    .join(" || ");
}

function getCreatedMemoriesFromDecisions(
  decisions: Awaited<ReturnType<typeof aiExtractReplyMemoriesFromDraftEdit>>,
) {
  return decisions.map((decision) => decision.newMemory).filter(isDefined);
}

function buildPreferenceMemoryEvidence(
  evidence: Array<{
    title?: string;
    content: string;
    draftText: string;
    sentText: string;
  }>,
) {
  return evidence
    .map(
      (item, index) => `${index + 1}. ${item.content}
Draft example: ${item.draftText}
Sent example: ${item.sentText}`,
    )
    .join("\n\n");
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

function buildLearnedWritingStyleComparisonInput({
  emailContent,
  withoutLearnedStyleReply,
  learnedWritingStyle,
}: {
  emailContent: string;
  withoutLearnedStyleReply: string;
  learnedWritingStyle: string;
}) {
  return [
    "## Current Email",
    emailContent,
    "",
    "## Reply Without Learned Style",
    withoutLearnedStyleReply,
    "",
    "## Learned Writing Style",
    learnedWritingStyle,
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

function formatLearnedWritingStyleActual({
  withoutLearnedStyleReply,
  withLearnedStyleReply,
  judgeResult,
}: {
  withoutLearnedStyleReply: string;
  withLearnedStyleReply: string;
  judgeResult: { pass: boolean; reasoning: string };
}) {
  return [
    `without=${JSON.stringify(withoutLearnedStyleReply)}`,
    `with=${JSON.stringify(withLearnedStyleReply)}`,
    `judge=${judgeResult.pass ? "PASS" : "FAIL"} (${judgeResult.reasoning})`,
  ].join(" | ");
}
