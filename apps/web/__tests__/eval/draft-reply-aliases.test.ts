import { afterAll, describe, expect, test } from "vitest";
import {
  aiDraftReplyWithConfidence,
  buildDraftReplyModelEvidence,
  type DraftReplyInput,
} from "@/utils/ai/reply/draft-reply";
import { getEmail } from "@/__tests__/helpers";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import type { JudgeCriterion } from "@/__tests__/eval/judge";

// EVAL_SAMPLES=5 pnpm test-ai eval/draft-reply-aliases

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 90_000;
const SAMPLES = Number(process.env.EVAL_SAMPLES || 1);

describe.runIf(shouldRunEval)("draft-reply aliases eval", () => {
  const evalReporter = createEvalReporter({ evalName: "draft-reply-aliases" });

  describeEvalMatrix("treats send-as aliases as the user", (model, base) => {
    const cases: AliasCase[] = [
      {
        name: "customer writes to the user's support alias",
        userEmail: "founder@mailwise.example",
        sendAsEmails: ["support@mailwise.example"],
        about: "Founder of Mailwise, an AI email assistant.",
        messages: [
          getEmail({
            from: "Jordan Pike <jordan@customer.example>",
            to: "support@mailwise.example",
            subject: "Export my data",
            content: `Hi,

Could you send me an export of all my saved rules before I switch plans?

Thanks,
Jordan`,
          }),
        ],
        expected:
          "The user handles the export request themselves, sending it or committing to send it.",
        criterion: {
          name: "Owns mail sent to the alias",
          description:
            "support@mailwise.example is the user's own send-as alias, not a separate person or team. The draft fails if it forwards, hands off, or refers the request to the support address, a support team, or anyone else, or talks about that address as someone other than the user.",
        },
      },
      {
        name: "client replies to a message the user sent from a studio alias",
        userEmail: "priya@fernhill.example",
        sendAsEmails: ["hello@brightline-studio.example"],
        about: null,
        messages: [
          getEmail({
            from: "Brightline Studio <hello@brightline-studio.example>",
            to: "Sam Ortiz <sam@ovenworks.example>",
            subject: "Logo refresh",
            content: `Hi Sam,

The logo refresh is $1,200 and takes two weeks. We can start on the 3rd.

Brightline Studio`,
          }),
          getEmail({
            from: "Sam Ortiz <sam@ovenworks.example>",
            to: "Brightline Studio <hello@brightline-studio.example>",
            cc: "priya@fernhill.example",
            subject: "Re: Logo refresh",
            content: `Thanks, that works. Does the $1,200 include a round of revisions?

Sam`,
          }),
        ],
        expected:
          "The user answers the revisions question directly as the person who sent the quote.",
        criterion: {
          name: "Speaks as the author of the earlier message",
          description:
            "hello@brightline-studio.example is the user's own send-as alias, so the user wrote the quote and Brightline Studio is the user. The draft fails if it says it will check with, ask, or pass the question to Brightline Studio, the studio, a team, or anyone else, or otherwise treats the earlier message as written by someone other than the user.",
        },
      },
      {
        name: "request sent to the user's sales alias",
        userEmail: "jane@acme.example",
        sendAsEmails: ["sales@acme.example"],
        about: null,
        messages: [
          getEmail({
            from: "Morgan Ellis <morgan@agency.example>",
            to: "Sales <sales@acme.example>",
            subject: "Enterprise pricing",
            content: `Hi,

We have 40 seats. Is there an enterprise discount, and can we pay annually by invoice?

Morgan`,
          }),
        ],
        expected:
          "The user answers the pricing questions directly, giving their most likely answers.",
        criterion: {
          name: "Owns mail sent to the alias",
          description:
            "sales@acme.example is the user's own send-as alias, not a separate team. The draft fails if it forwards, hands off, or refers the request to a sales team, the sales address, or anyone else, or says someone else will follow up.",
        },
      },
    ];

    for (const aliasCase of cases) {
      describe(aliasCase.name, () => {
        for (let sample = 1; sample <= SAMPLES; sample++) {
          test.concurrent(
            `sample ${sample}`,
            async () => {
              const result = await draftForEval({
                messages: aliasCase.messages.map((message, index) => ({
                  ...message,
                  date: new Date(Date.UTC(2026, 4, 12, 7 + index)),
                })),
                emailAccount: {
                  ...base,
                  email: aliasCase.userEmail,
                  about: aliasCase.about,
                },
                sendAsEmails: aliasCase.sendAsEmails,
                knowledgeBaseContent: null,
                emailHistorySummary: null,
                emailHistoryContext: null,
                calendarAvailability: null,
                writingStyle: null,
                mcpContext: null,
                meetingContext: null,
              });

              const judgeResult = await judgeEvalOutput({
                input: result.modelEvidence,
                output: result.reply,
                expected: aliasCase.expected,
                criterion: aliasCase.criterion,
              });

              evalReporter.record({
                testName: `${aliasCase.name} #${sample}`,
                model: model.label,
                pass: judgeResult.pass,
                expected: aliasCase.expected,
                actual: formatSemanticJudgeActual(result.reply, judgeResult),
              });

              expect(
                judgeResult.pass,
                `Reply:\n${result.reply}\n\nJudge: ${judgeResult.reasoning}`,
              ).toBe(true);
            },
            TIMEOUT,
          );
        }
      });
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

type AliasCase = {
  name: string;
  userEmail: string;
  sendAsEmails: string[];
  about: string | null;
  messages: ReturnType<typeof getEmail>[];
  expected: string;
  criterion: JudgeCriterion;
};

async function draftForEval(input: DraftReplyInput) {
  const resolvedInput = {
    ...input,
    currentDate: new Date("2026-05-12T09:30:00Z"),
  };
  const result = await aiDraftReplyWithConfidence(resolvedInput);
  const evidence = buildDraftReplyModelEvidence(resolvedInput);
  return {
    ...result,
    modelEvidence: [
      evidence.thread,
      evidence.context,
      evidence.temporalAndIdentityContext,
    ].join("\n\n"),
  };
}
