import { afterAll, describe, expect, test, vi } from "vitest";
import { aiDraftReplyWithConfidence } from "@/utils/ai/reply/draft-reply";
import { getEmail } from "@/__tests__/helpers";
import { judgeMultiple } from "@/__tests__/eval/judge";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";

// pnpm test-ai eval/draft-reply

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 90_000;

vi.mock("server-only", () => ({}));

const TIME_SLOT_PATTERN =
  /\b(?:March|April|May|June|July|August|September|October|November|December|January|February)\s+\d{1,2}[:\s]+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?/i;

const SPECIFIC_TIME_PATTERN =
  /\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\s*[-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?/i;

function assertNoSpecificTimes(reply: string, context: string) {
  // biome-ignore lint/suspicious/noMisplacedAssertion: extracted assertion helper called from tests
  expect(
    TIME_SLOT_PATTERN.test(reply),
    `Draft should NOT contain specific date+time slots. ${context}\n\nDraft:\n${reply}`,
  ).toBe(false);
  // biome-ignore lint/suspicious/noMisplacedAssertion: extracted assertion helper called from tests
  expect(
    SPECIFIC_TIME_PATTERN.test(reply),
    `Draft should NOT contain time ranges. ${context}\n\nDraft:\n${reply}`,
  ).toBe(false);
}

function hasSpecificTimes(reply: string): boolean {
  return TIME_SLOT_PATTERN.test(reply) || SPECIFIC_TIME_PATTERN.test(reply);
}

describe.runIf(shouldRunEval)("draft-reply eval", () => {
  const evalReporter = createEvalReporter();

  describeEvalMatrix("draft quality", (model, emailAccount) => {
    describe("scheduling aggressiveness (should not offer times)", () => {
      test(
        "marketing email with booking CTA — should not offer specific times",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Lisa from MindfulPath <lisa@product.mindfulpath.com>",
                to: emailAccount.email,
                subject: "Earn a $30 gift card by sharing your thoughts",
                content: `Hey there,

I'm Lisa, the Research Lead here at MindfulPath. I'm reaching out on behalf of our User Experience team.

We'd love to hear about your experience with our app so far.

Our sessions are quick — no more than 20 minutes over video call — and as a thank you, we'll send you a $30 gift card.

You can pick a time that works for you here: https://cal.mindfulpath.com/research

Thank you!
Lisa & the MindfulPath Team`,
              }),
              date: new Date("2026-03-10T13:06:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "marketing email with booking CTA";
          const pass = !hasSpecificTimes(result.reply);
          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "no specific times",
            actual: pass ? "clean draft" : "contains time suggestions",
          });

          assertNoSpecificTimes(
            result.reply,
            "Marketing email with scheduling CTA should not trigger time suggestions",
          );
        },
        TIMEOUT,
      );

      test(
        "email with existing booking link — should reference link, not invent times",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Sam from DataBridge <sam@databridge.io>",
                to: emailAccount.email,
                subject: "Would love to learn about your integration needs",
                content: `Hi there,

I noticed you signed up for DataBridge recently. I'd love to learn more about your use case and see if we can help.

Feel free to grab a time on my calendar: https://cal.databridge.io/sam/30min

Looking forward to connecting!

Sam
Solutions Engineer, DataBridge`,
              }),
              date: new Date("2026-03-10T10:00:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "booking link email";
          const pass = !hasSpecificTimes(result.reply);
          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "no specific times",
            actual: pass ? "clean draft" : "contains time suggestions",
          });

          assertNoSpecificTimes(
            result.reply,
            "Email already provides a booking link — draft should not invent times",
          );
        },
        TIMEOUT,
      );
    });

    describe("genuine scheduling (may suggest times with calendar data)", () => {
      test(
        "personal scheduling request with calendar availability",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Priya Sharma <priya@launchpad.dev>",
                to: emailAccount.email,
                subject: "Quick sync this week?",
                content: `Hey,

Are you free for a quick 30-minute call this week? I want to discuss the partnership proposal.

Let me know what works!

Priya`,
              }),
              date: new Date("2026-03-10T14:00:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: {
              suggestedTimes: [
                { start: "2026-03-12 10:00", end: "2026-03-12 10:30" },
                { start: "2026-03-12 14:00", end: "2026-03-12 14:30" },
              ],
            },
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "genuine scheduling request";
          const pass = result.reply.length > 10;
          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "substantive draft",
            actual: pass ? "has content" : "empty/too short",
          });

          expect(
            result.reply.length,
            "Draft should have content for a genuine scheduling request",
          ).toBeGreaterThan(10);
        },
        TIMEOUT,
      );
    });

    describe("non-scheduling email (should not mention times)", () => {
      test(
        "question about a feature — should answer, not offer times",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Carlos Reyes <carlos@clientcorp.com>",
                to: emailAccount.email,
                subject: "Quick question about API limits",
                content: `Hey,

I was looking at the docs and couldn't find info on rate limits for the bulk import endpoint. What's the max number of records per request?

Thanks,
Carlos`,
              }),
              date: new Date("2026-03-10T09:00:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "non-scheduling question";
          const pass = !hasSpecificTimes(result.reply);
          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "no specific times",
            actual: pass ? "clean draft" : "contains time suggestions",
          });

          assertNoSpecificTimes(
            result.reply,
            "Non-scheduling question should not contain time suggestions",
          );
        },
        TIMEOUT,
      );
    });

    describe("grounded product replies", () => {
      test(
        "customer feedback reply uses supplied knowledge base facts",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: emailAccount.email,
                to: "customer@example.com",
                subject: "Getting started feedback",
                content: `Hey,

Thanks again for trying the product.

I'd love to hear what felt easy, what felt confusing, and anything you wish existed.

Best,
Founder`,
              }),
              date: new Date("2026-03-11T19:54:00Z"),
            },
            {
              ...getEmail({
                from: "customer@example.com",
                to: emailAccount.email,
                subject: "Re: Getting started feedback",
                content: `Hi,

The setup process felt pretty smooth overall.

It might help to mention earlier that the assistant works better when the inbox is already in decent shape.

It would also be useful to show a few sample rule instructions so it is clearer how to phrase them.

Also, what model or provider does the assistant use by default?`,
              }),
              date: new Date("2026-03-14T03:47:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount,
            knowledgeBaseContent: [
              "Reply guidance for product-feedback questions:",
              "- If someone asks about setup quality, mention that a cleaner inbox usually leads to better results during setup.",
              "- If someone asks for rule examples, give concrete examples such as 'Archive newsletters you never read' and 'Label billing emails as Finance'.",
              "- If someone asks what powers the assistant by default, say that Inbox Zero manages the model stack by default.",
              "- You may also mention that users can bring their own API key if they prefer.",
              "- Do not name a specific provider or model unless it is explicitly stated here.",
            ].join("\n"),
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "grounded product feedback reply";
          console.log(`\n[${model.label}] ${testName}\n${result.reply}\n`);

          const judgeResult = await maybeJudgeGroundedReply({
            emailAccount,
            messages,
            reply: result.reply,
          });

          const pass = judgeResult.allPassed;

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected:
              "grounded, concise reply with no invented provider details",
            actual: formatDraftEvalActual(result.reply, judgeResult.results),
            criteria: judgeResult.results,
          });

          expect(
            pass,
            `Draft drifted from grounded product reply expectations.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult.results,
              null,
              2,
            )}`,
          ).toBe(true);
        },
        TIMEOUT,
      );
    });

    describe("punctuation defaults", () => {
      test(
        "does not use em dash when writing style does not ask for it",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "sender@example.com",
                to: emailAccount.email,
                subject: "Quick question",
                content: `Hi,

Thanks for the help so far.

Could you send over a couple of examples for how to write rules?`,
              }),
              date: new Date("2026-03-14T10:00:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "no em dash by default";
          const pass = !result.reply.includes("—");

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "reply without em dash",
            actual: JSON.stringify(result.reply),
          });

          expect(
            result.reply.includes("—"),
            `Reply should not contain an em dash unless the writing style explicitly asks for it.\n\nReply:\n${result.reply}`,
          ).toBe(false);
        },
        TIMEOUT,
      );
    });
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function getKnowledgeBaseReplyCriteria() {
  return [
    {
      name: "Knowledge base use",
      description:
        "The reply uses the provided knowledge base facts for setup guidance, rule examples, and the model-stack answer instead of inventing different product details.",
    },
    {
      name: "Voice match",
      description:
        "The reply matches a terse, plainspoken founder voice. It should feel concise and avoid flashy punctuation such as em dashes.",
    },
    {
      name: "Restraint",
      description:
        "The reply answers the sender's questions without adding unsupported internal plans, roadmap hints, speculative promises, or unrelated suggestions.",
    },
  ];
}

function formatDraftEvalActual(
  reply: string,
  judgeResults: Awaited<ReturnType<typeof judgeMultiple>>["results"],
) {
  const failedCriteria = judgeResults
    .filter((result) => !result.pass)
    .map((result) => result.criterion);

  const parts = [];

  if (failedCriteria.length) {
    parts.push(`judge=${failedCriteria.join(",")}`);
  }

  if (!parts.length) parts.push("clean");

  parts.push(`reply=${JSON.stringify(reply)}`);

  return parts.join(" | ");
}

async function maybeJudgeGroundedReply({
  emailAccount,
  messages,
  reply,
}: {
  emailAccount: {
    user: {
      aiProvider: string | null;
      aiModel: string | null;
      aiApiKey: string | null;
    };
  };
  messages: { content: string }[];
  reply: string;
}) {
  return judgeMultiple({
    input: messages.map((message) => message.content).join("\n\n---\n\n"),
    output: reply,
    expected: [
      "Reply briefly and helpfully.",
      "Acknowledge that a cleaner inbox tends to improve setup results.",
      "Give one or two concrete rule examples.",
      "Say that Inbox Zero manages the model stack by default.",
      "Optional: mention that users can bring their own API key.",
      "Do not introduce a specific provider or model that was not present in the provided context.",
    ].join("\n"),
    criteria: getKnowledgeBaseReplyCriteria(),
    judgeUserAi: getEvalJudgeUserAi(),
  });
}

function getEvalJudgeUserAi() {
  return {
    aiProvider: "openrouter",
    aiModel: "google/gemini-3.1-flash-lite-preview",
    aiApiKey: process.env.OPENROUTER_API_KEY ?? null,
  };
}
