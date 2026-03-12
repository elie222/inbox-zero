import { afterAll, describe, expect, test, vi } from "vitest";
import { aiDraftReplyWithConfidence } from "@/utils/ai/reply/draft-reply";
import { getEmail } from "@/__tests__/helpers";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";

// pnpm test-ai eval/draft-reply

const isAiTest = process.env.RUN_AI_TESTS === "true";
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

describe.runIf(isAiTest)("draft-reply eval", () => {
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
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});
