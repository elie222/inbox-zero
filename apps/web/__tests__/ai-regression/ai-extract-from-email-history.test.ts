/** biome-ignore-all lint/style/noMagicNumbers: test */
import { describe, expect, test, vi } from "vitest";
import { aiExtractFromEmailHistory } from "@/utils/ai/knowledge/extract-from-email-history";
import type { EmailForLLM } from "@/utils/types";
import { getEmailAccount, createTestLogger } from "@/__tests__/helpers";
import { judgeBinary } from "@/__tests__/eval/judge";

// Run with: pnpm test-ai ai-regression/ai-extract-from-email-history

const TIMEOUT = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const logger = createTestLogger();

const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)("aiExtractFromEmailHistory", () => {
  test("returns null when there is no history", async () => {
    const result = await aiExtractFromEmailHistory({
      currentThreadMessages: [getMessage({ daysAgo: 0 })],
      historicalMessages: [],
      emailAccount: getEmailAccount(),
      logger,
    });

    expect(result).toBeNull();
  });

  test(
    "extracts the earlier commitments the current thread asks about",
    async () => {
      const deadline = new Date(Date.now() + 21 * DAY_MS).toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric" },
      );
      const currentThreadMessages = [
        getMessage({
          daysAgo: 0,
          subject: "Project Atlas check-in",
          content:
            "Hi, quick check before I plan my week: when did we agree to meet about Project Atlas, and when is the final report due?",
        }),
      ];
      const historicalMessages = [
        getMessage({
          id: "hist1",
          daysAgo: 10,
          from: "user@test.com",
          to: "sender@test.com",
          subject: "Project Atlas kickoff",
          content:
            "Confirmed: let's meet Friday at 3 PM to review Project Atlas.",
        }),
        getMessage({
          id: "hist2",
          daysAgo: 9,
          subject: "Re: Project Atlas kickoff",
          content: `Sounds good. For the record, the final Project Atlas report is due ${deadline}.`,
        }),
      ];

      const result = await aiExtractFromEmailHistory({
        currentThreadMessages,
        historicalMessages,
        emailAccount: getEmailAccount(),
        logger,
      });

      expect(result).toBeTruthy();
      expect(result!.length).toBeLessThanOrEqual(500);

      const judgement = await judgeBinary({
        input: `Current thread asks: when the Project Atlas meeting is and when the final report is due.\nHistory: meeting agreed for Friday at 3 PM; final report due ${deadline}.`,
        output: result!,
        criterion: {
          name: "Captures the requested commitments",
          description: `The summary states that the meeting was agreed for Friday at 3 PM and that the final report is due ${deadline} (any date format is fine). It does not invent other times or dates.`,
        },
      });
      expect(judgement.pass, judgement.reasoning).toBe(true);
    },
    TIMEOUT,
  );

  test(
    "returns null when the history is unrelated to the current thread",
    async () => {
      // The extractor also returns null on failure, so a logged error must fail
      // this test rather than pass as an "unrelated" verdict.
      const errorSpy = vi.spyOn(logger, "error");

      const result = await aiExtractFromEmailHistory({
        currentThreadMessages: [
          getMessage({
            daysAgo: 0,
            subject: "Invoice for October",
            content: "Please find attached the invoice for October services.",
          }),
        ],
        historicalMessages: [
          getMessage({
            id: "hist1",
            daysAgo: 30,
            subject: "Team offsite photos",
            content: "Here are the photos from the team offsite. Enjoy!",
          }),
        ],
        emailAccount: getEmailAccount(),
        logger,
      });

      expect(errorSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();
      errorSpy.mockRestore();
    },
    TIMEOUT,
  );
});

function getMessage({
  daysAgo,
  ...overrides
}: Partial<EmailForLLM> & { daysAgo: number }): EmailForLLM {
  return {
    id: "msg1",
    from: "sender@test.com",
    to: "user@test.com",
    subject: "Test Subject",
    content: "This is a test email content.",
    date: new Date(Date.now() - daysAgo * DAY_MS),
    ...overrides,
  };
}
