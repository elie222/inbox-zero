import { afterAll, describe, expect, test } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import {
  CLEAR_ACTION_ITEMS_TRANSCRIPT,
  REVERSED_DECISION_TRANSCRIPT,
  UNRESOLVED_PRICING_TRANSCRIPT,
} from "@/__tests__/eval/meeting-transcript-fixtures";
import { aiSummarizeMeeting } from "@/utils/ai/meeting-recorder/summarize-meeting";
import { transcriptToPromptText } from "@/utils/meeting-recorder/transcript-prompt";

// pnpm test-ai eval/meeting-summary

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 90_000;

describe.runIf(shouldRunEval)("meeting-summary eval", () => {
  const evalReporter = createEvalReporter({ evalName: "meeting-summary" });

  describeEvalMatrix("meeting summary quality", (model, emailAccount) => {
    test(
      "reports the decision the meeting settled on, not the one it reversed",
      async () => {
        const summary = await aiSummarizeMeeting({
          emailAccount,
          eventTitle: "Rollout planning",
          attendees: [
            { email: "dana@example.com", name: "Dana Whitfield" },
            { email: "chris.alvarez@example.com", name: "Chris Alvarez" },
            { email: "chris.okonkwo@example.com", name: "Chris Okonkwo" },
          ],
          transcript: REVERSED_DECISION_TRANSCRIPT,
        });

        const judgeResult = await judgeEvalOutput({
          criterion: {
            name: "Final decision only",
            description:
              "The summary presents the rollout date the group finally agreed on and does not present the earlier, superseded date as the outcome. Mentioning the earlier date as context that was changed is acceptable; presenting it as the decision is not.",
          },
          input: transcriptToPromptText(REVERSED_DECISION_TRANSCRIPT),
          output: JSON.stringify(summary, null, 2),
        });

        record({
          evalReporter,
          model: model.label,
          testName: "final decision after a reversal",
          expected: "the later agreed date is the decision",
          summary,
          judgeResult,
        });

        expect(judgeResult.pass, judgeResult.reasoning).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "does not invent an owner for work nobody claimed",
      async () => {
        const summary = await aiSummarizeMeeting({
          emailAccount,
          eventTitle: "Rollout planning",
          attendees: [
            { email: "dana@example.com", name: "Dana Whitfield" },
            { email: "chris.alvarez@example.com", name: "Chris Alvarez" },
            { email: "chris.okonkwo@example.com", name: "Chris Okonkwo" },
          ],
          transcript: REVERSED_DECISION_TRANSCRIPT,
        });

        const judgeResult = await judgeEvalOutput({
          criterion: {
            name: "Owners are grounded in the transcript",
            description:
              "Every action item that names an owner names someone the transcript actually shows taking that work on. Work that was agreed but explicitly left unassigned must not be attributed to anyone. Action items with no owner at all are correct here.",
          },
          input: transcriptToPromptText(REVERSED_DECISION_TRANSCRIPT),
          output: JSON.stringify(summary, null, 2),
        });

        record({
          evalReporter,
          model: model.label,
          testName: "no invented owners",
          expected: "unassigned work stays unassigned",
          summary,
          judgeResult,
        });

        expect(judgeResult.pass, judgeResult.reasoning).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "does not resolve a question the meeting left open",
      async () => {
        const summary = await aiSummarizeMeeting({
          emailAccount,
          eventTitle: "Pricing follow-up",
          attendees: [
            { email: "priya@customer.example.com", name: "Priya Raman" },
            { email: "tom@example.com", name: "Tom Beckett" },
          ],
          transcript: UNRESOLVED_PRICING_TRANSCRIPT,
        });

        const judgeResult = await judgeEvalOutput({
          criterion: {
            name: "Unresolved stays unresolved",
            description:
              "The seat-count pricing question was raised and explicitly not answered. The summary must not state or imply any pricing outcome, seat count decision or commercial commitment. Recording it as unresolved or as something to follow up on is correct.",
          },
          input: transcriptToPromptText(UNRESOLVED_PRICING_TRANSCRIPT),
          output: JSON.stringify(summary, null, 2),
        });

        record({
          evalReporter,
          model: model.label,
          testName: "unresolved pricing question",
          expected: "no fabricated pricing outcome",
          summary,
          judgeResult,
        });

        expect(judgeResult.pass, judgeResult.reasoning).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "captures a clearly owned commitment with its deadline",
      async () => {
        const summary = await aiSummarizeMeeting({
          emailAccount,
          eventTitle: "Security review",
          attendees: [
            { email: "sam@customer.example.com", name: "Sam Ortiz" },
            { email: "jules@example.com", name: "Jules Fontaine" },
          ],
          transcript: CLEAR_ACTION_ITEMS_TRANSCRIPT,
        });

        const judgeResult = await judgeEvalOutput({
          criterion: {
            name: "Owned commitment captured",
            description:
              "The summary records that the person who said they would finish and send the questionnaire is responsible for it, and reflects the timing they committed to.",
          },
          input: transcriptToPromptText(CLEAR_ACTION_ITEMS_TRANSCRIPT),
          output: JSON.stringify(summary, null, 2),
        });

        record({
          evalReporter,
          model: model.label,
          testName: "owned commitment with deadline",
          expected: "questionnaire owner and timing captured",
          summary,
          judgeResult,
        });

        expect(judgeResult.pass, judgeResult.reasoning).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "keeps a short meeting's summary short",
      async () => {
        const summary = await aiSummarizeMeeting({
          emailAccount,
          eventTitle: "Security review",
          attendees: [
            { email: "sam@customer.example.com", name: "Sam Ortiz" },
            { email: "jules@example.com", name: "Jules Fontaine" },
          ],
          transcript: CLEAR_ACTION_ITEMS_TRANSCRIPT,
        });

        const judgeResult = await judgeEvalOutput({
          criterion: {
            name: "Proportionate length",
            description:
              "This was a short, single-topic meeting. The summary should read as a reminder for someone who attended, not a re-narration of the call. It should not pad empty sections with filler entries that restate the overview.",
          },
          input: transcriptToPromptText(CLEAR_ACTION_ITEMS_TRANSCRIPT),
          output: JSON.stringify(summary, null, 2),
        });

        record({
          evalReporter,
          model: model.label,
          testName: "proportionate summary length",
          expected: "concise, no filler sections",
          summary,
          judgeResult,
        });

        expect(judgeResult.pass, judgeResult.reasoning).toBe(true);
      },
      TIMEOUT,
    );
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function record({
  evalReporter,
  model,
  testName,
  expected,
  summary,
  judgeResult,
}: {
  evalReporter: ReturnType<typeof createEvalReporter>;
  model: string;
  testName: string;
  expected: string;
  summary: unknown;
  judgeResult: { pass: boolean; reasoning: string };
}) {
  evalReporter.record({
    testName,
    model,
    pass: judgeResult.pass,
    expected,
    actual: formatSemanticJudgeActual(JSON.stringify(summary), judgeResult),
  });
}
