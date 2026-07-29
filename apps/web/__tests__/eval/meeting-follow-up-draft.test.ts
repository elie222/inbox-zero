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
import { aiDraftMeetingFollowUp } from "@/utils/ai/meeting-recorder/draft-meeting-follow-up";
import type { MeetingSummary } from "@/utils/ai/meeting-recorder/summarize-meeting";

// pnpm test-ai eval/meeting-follow-up-draft

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 90_000;

const ROLLOUT_SUMMARY: MeetingSummary = {
  overview:
    "The group reviewed the rollout plan. Support is short-staffed the week of the fifteenth, so the full rollout moved to the twenty-second.",
  keyDecisions: ["Full rollout moves from the fifteenth to the twenty-second"],
  actionItems: [
    { description: "Update the launch doc with the new date", owner: "Dana" },
    {
      description:
        "Tell the customers who already have the fifteenth in writing",
    },
  ],
  openQuestions: ["Who owns the migration webinar?"],
  nextSteps: ["Pick up the migration webinar next week"],
};

const UNRESOLVED_PRICING_SUMMARY: MeetingSummary = {
  overview:
    "The customer is happy with the integration but is blocked on how seats are counted. No pricing answer was given on the call.",
  keyDecisions: [],
  actionItems: [
    {
      description:
        "Check with the commercial team how seats are counted and come back with an answer",
      owner: "Tom",
    },
  ],
  openQuestions: [
    "Do they pay for all forty people or only the fifteen daily users?",
  ],
};

describe.runIf(shouldRunEval)("meeting-follow-up-draft eval", () => {
  const evalReporter = createEvalReporter({
    evalName: "meeting-follow-up-draft",
  });

  describeEvalMatrix("follow-up draft quality", (model, emailAccount) => {
    test(
      "does not commit to anything the meeting did not agree",
      async () => {
        const draft = await aiDraftMeetingFollowUp({
          emailAccount,
          eventTitle: "Pricing follow-up",
          summary: UNRESOLVED_PRICING_SUMMARY,
          recipients: [
            { email: "priya@customer.example.com", name: "Priya Raman" },
          ],
          writingStyle: null,
        });

        const judgeResult = await judgeEvalOutput({
          criterion: {
            name: "No fabricated commitments",
            description:
              "The seat-count pricing question was left unanswered. The email must not state a price, a seat count, a discount or a date by which an answer will arrive, because none of those were agreed. Saying the sender will come back with an answer is correct.",
          },
          input: JSON.stringify(UNRESOLVED_PRICING_SUMMARY, null, 2),
          output: `${draft.subject}\n\n${draft.body}`,
        });

        record({
          evalReporter,
          model: model.label,
          testName: "no fabricated commitments",
          expected: "no invented price, seat count or deadline",
          draft,
          judgeResult,
        });

        expect(judgeResult.pass, judgeResult.reasoning).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "reflects the decision the meeting actually reached",
      async () => {
        const draft = await aiDraftMeetingFollowUp({
          emailAccount,
          eventTitle: "Rollout planning",
          summary: ROLLOUT_SUMMARY,
          recipients: [
            { email: "chris.alvarez@example.com", name: "Chris Alvarez" },
            { email: "chris.okonkwo@example.com", name: "Chris Okonkwo" },
          ],
          writingStyle: null,
        });

        const judgeResult = await judgeEvalOutput({
          criterion: {
            name: "Correct decision recapped",
            description:
              "The email recaps the rollout date the group agreed on, and does not present the earlier date as the plan going forward.",
          },
          input: JSON.stringify(ROLLOUT_SUMMARY, null, 2),
          output: `${draft.subject}\n\n${draft.body}`,
        });

        record({
          evalReporter,
          model: model.label,
          testName: "correct decision recapped",
          expected: "the agreed date, not the superseded one",
          draft,
          judgeResult,
        });

        expect(judgeResult.pass, judgeResult.reasoning).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "is ready to send to a group without placeholders",
      async () => {
        const draft = await aiDraftMeetingFollowUp({
          emailAccount,
          eventTitle: "Rollout planning",
          summary: ROLLOUT_SUMMARY,
          recipients: [
            { email: "chris.alvarez@example.com", name: "Chris Alvarez" },
            { email: "chris.okonkwo@example.com", name: "Chris Okonkwo" },
          ],
          writingStyle: null,
        });

        const judgeResult = await judgeEvalOutput({
          criterion: {
            name: "Ready to send",
            description:
              "The email is addressed to the group and could be sent as written. It contains no unfilled placeholders for the sender to complete, no meta-commentary about being AI-generated, and no instructions to the reader about how to use the draft.",
          },
          input: JSON.stringify(ROLLOUT_SUMMARY, null, 2),
          output: `${draft.subject}\n\n${draft.body}`,
        });

        record({
          evalReporter,
          model: model.label,
          testName: "ready to send to a group",
          expected: "sendable as written",
          draft,
          judgeResult,
        });

        expect(judgeResult.pass, judgeResult.reasoning).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "reads as an email rather than a transcript of the summary",
      async () => {
        const draft = await aiDraftMeetingFollowUp({
          emailAccount,
          eventTitle: "Rollout planning",
          summary: ROLLOUT_SUMMARY,
          recipients: [
            { email: "chris.alvarez@example.com", name: "Chris Alvarez" },
          ],
          writingStyle: null,
        });

        const judgeResult = await judgeEvalOutput({
          criterion: {
            name: "Written as an email",
            description:
              "The output reads as a follow-up email a colleague would send: it recaps what matters to the recipient rather than dumping every field of the summary, and it does not include internal section headings from the summary structure.",
          },
          input: JSON.stringify(ROLLOUT_SUMMARY, null, 2),
          output: `${draft.subject}\n\n${draft.body}`,
        });

        record({
          evalReporter,
          model: model.label,
          testName: "reads as an email",
          expected: "a real email, not a dumped summary",
          draft,
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
  draft,
  judgeResult,
}: {
  evalReporter: ReturnType<typeof createEvalReporter>;
  model: string;
  testName: string;
  expected: string;
  draft: { subject: string; body: string };
  judgeResult: { pass: boolean; reasoning: string };
}) {
  evalReporter.record({
    testName,
    model,
    pass: judgeResult.pass,
    expected,
    actual: formatSemanticJudgeActual(
      `${draft.subject}\n\n${draft.body}`,
      judgeResult,
    ),
  });
}
