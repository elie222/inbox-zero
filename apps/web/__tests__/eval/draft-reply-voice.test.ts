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

// EVAL_MODELS=gpt-6-luna,claude-haiku-5.5 EVAL_SAMPLES=5 pnpm test-ai eval/draft-reply-voice

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 90_000;
const SAMPLES = Number(process.env.EVAL_SAMPLES || 1);
const FOUNDER_ABOUT = "Founder of Mailwise, an AI email assistant.";
const TERSE_STYLE = `Typical Length: Very short, typically 1-2 sentences
Formality: Informal
Common Greeting: Usually none
Notable Traits: Direct, uses contractions, rarely signs off`;

describe.runIf(shouldRunEval)("draft-reply voice eval", () => {
  const evalReporter = createEvalReporter({ evalName: "draft-reply-voice" });

  describeEvalMatrix("answers as the user", (model, baseEmailAccount) => {
    const emailAccount = {
      ...baseEmailAccount,
      email: "founder@mailwise.example",
      about: FOUNDER_ABOUT,
    };

    const cases: VoiceCase[] = [
      {
        name: "cancel request with the support inbox copied",
        about: null,
        writingStyle: TERSE_STYLE,
        messages: [
          getEmail({
            from: "Jordan Pike <jordan@customer.example>",
            to: emailAccount.email,
            cc: "support@mailwise.example",
            subject: "Cancel my subscription",
            content: `Hi,

I tried cancelling from the billing page twice and it errors out both times. Please cancel my subscription, I don't want to be charged again next month.

Jordan`,
          }),
        ],
        knowledgeBaseContent:
          'If someone asks to cancel their plan, tell them they can do so at https://app.mailwise.example/billing by clicking "Manage Subscription". If they\'re still having trouble with that I can cancel it for them.',
        expected:
          "The user cancels it for them (or says they will), since the self-serve page already failed for the sender.",
        criterion: {
          name: "Handles it as the user",
          description:
            "The draft should take ownership as the user: cancel the subscription or commit to cancelling it. It fails if it hands the request to the support inbox, a team, or anyone else instead of the user; if it claims the user copied, added, or looped anyone in; or if it only sends the sender back to the billing page that already failed.",
        },
      },
      {
        name: "duplicate charge with the sender's colleague copied",
        messages: [
          getEmail({
            from: "Riley Moss <riley@studio.example>",
            to: emailAccount.email,
            cc: "Avery Chen <avery@studio.example>",
            subject: "Charged twice",
            content: `Hi,

We were charged twice for this month's plan (same amount, same day). Copying Avery from our finance side. Can you refund the duplicate?

Thanks,
Riley`,
          }),
        ],
        knowledgeBaseContent:
          "Duplicate charges are refunded in full. I issue refunds myself from the billing dashboard.",
        expected:
          "The user refunds the duplicate charge or commits to doing so.",
        criterion: {
          name: "Owns the refund",
          description:
            "The draft should answer as the user and refund or commit to refunding the duplicate. It fails if it assigns the refund to the copied colleague, a support or finance team, or anyone other than the user, or if it claims the user copied or looped anyone in.",
        },
      },
      {
        name: "misdirected email about a physical product",
        messages: [
          getEmail({
            from: "Casey Lund <casey@home.example>",
            to: emailAccount.email,
            subject: "Replacement drawer",
            content: `Hello,

One of the drawers on the standing desk I ordered arrived cracked. How do I order a replacement drawer?

Casey`,
          }),
        ],
        knowledgeBaseContent: null,
        expected:
          "A plain statement that they have reached Mailwise, an email app, not the desk seller, and that they should contact the retailer or manufacturer.",
        criterion: {
          name: "States the user's own facts plainly",
          description:
            "The draft should tell the sender plainly that they reached the wrong company. It fails if it hedges or sounds unsure about facts the user knows for certain, such as which company this is or what it sells (for example presenting it as a guess or impression), or if it tries to help with the desk order as though the user sold it.",
        },
      },
      {
        name: "plan question partly covered by the knowledge base",
        messages: [
          getEmail({
            from: "Morgan Ellis <morgan@agency.example>",
            to: emailAccount.email,
            subject: "Plus plan questions",
            content: `Hi,

Before I upgrade: does Plus cover 4 inboxes, and what does it cost? Do AI drafts work on all four accounts, and will replies go out from whichever address the email came into?

Thanks,
Morgan`,
          }),
        ],
        knowledgeBaseContent:
          "Plus supports up to 4 connected email accounts and costs $35/month.",
        expected:
          "Answers every question as the founder: Plus covers 4 inboxes at $35/month, and gives the founder's most likely answers on drafts and sending address.",
        criterion: {
          name: "Answers as the user without voicing its own doubts",
          description:
            "The draft should answer every question as the founder who knows the product, giving the most likely answer where the knowledge base is silent. It fails if it says or implies the writer is unsure, cannot confirm, or does not want to guess or give a wrong answer about their own product; if it promises to check later; or if it refers the sender to someone else.",
        },
      },
      {
        name: "integration question the knowledge base does not cover",
        writingStyle: TERSE_STYLE,
        messages: [
          getEmail({
            from: "Taylor Grant <taylor@firm.example>",
            to: emailAccount.email,
            subject: "Calendar question",
            content: `Hey,

Does Mailwise work with Outlook calendars or only Google? We're on Microsoft 365.

Taylor`,
          }),
        ],
        knowledgeBaseContent: null,
        expected:
          "A short, direct answer as the founder giving the most likely answer about Outlook calendar support.",
        criterion: {
          name: "Answers about their own product",
          description:
            "The draft should answer as the founder who knows their product, giving a direct most-likely answer. It fails if it says or implies the writer is unsure, cannot confirm, or does not want to guess about their own product; if it promises to check and get back instead of answering; or if it refers the sender to someone else.",
        },
      },
      {
        name: "quote approval with the user's assistant copied",
        writingStyle: TERSE_STYLE,
        about: "Owner of Birchline Bakery.",
        messages: [
          getEmail({
            from: "Sam Ortiz <sam@ovenworks.example>",
            to: emailAccount.email,
            cc: "Lee Park <lee@birchline.example>",
            subject: "Oven service quote",
            content: `Hi,

Quote for the annual oven service is $640, and we can do it next Tuesday morning. Can you approve so we can book it in? Copying Lee as requested.

Sam`,
          }),
        ],
        knowledgeBaseContent: null,
        expected:
          "The owner approves (or declines) the quote directly as the decision maker.",
        criterion: {
          name: "Decides as the user",
          description:
            "The draft should give the owner's decision on the quote directly. It fails if it defers the decision to the copied person or anyone else, claims the user copied or added anyone, or says the writer needs to check or is unsure instead of deciding.",
        },
      },
      {
        name: "job application sent to the wrong organisation",
        about: "Partner at Fernhill Design, a small branding studio.",
        messages: [
          getEmail({
            from: "Jamie Holt <jamie@mail.example>",
            to: emailAccount.email,
            subject: "Application: night shift nurse",
            content: `Dear hiring team,

Please find my application for the night shift nurse position attached. I have five years of ward experience and can start next month.

Kind regards,
Jamie Holt`,
          }),
        ],
        knowledgeBaseContent: null,
        expected:
          "A plain note that this reached a branding studio, not the hospital or clinic hiring nurses, so they should send it to the right employer.",
        criterion: {
          name: "Corrects the mix-up plainly",
          description:
            "The draft should tell the sender plainly that they reached a branding studio and should apply to the right employer. It fails if it hedges about facts the user knows for certain, such as what their own business is (for example presenting it as a guess, impression, or possibility), or if it engages with the application as though the user were hiring nurses.",
        },
      },
      {
        name: "data use question the knowledge base does not cover",
        writingStyle: TERSE_STYLE,
        messages: [
          getEmail({
            from: "Robin Shah <robin@clinic.example>",
            to: emailAccount.email,
            subject: "Data question",
            content: `Hi,

Before we roll Mailwise out to the team: are our emails used to train AI models?

Robin`,
          }),
        ],
        knowledgeBaseContent: null,
        expected:
          "A direct answer as the founder with their most likely answer about training on customer email.",
        criterion: {
          name: "Answers about their own product",
          description:
            "The draft should answer as the founder who knows their product, giving a direct most-likely answer. It fails if it says or implies the writer is unsure, cannot confirm, or does not want to guess about their own product; if it promises to check and get back instead of answering; or if it refers the sender to someone else.",
        },
      },
      {
        name: "bug report still gets an investigation",
        writingStyle: TERSE_STYLE,
        messages: [
          getEmail({
            from: "Alex Moreno <alex@shop.example>",
            to: emailAccount.email,
            subject: "Drafts stopped appearing",
            content: `Hi,

Since yesterday no drafts are showing up in my inbox at all, even for emails that clearly need a reply. Nothing changed on my side.

Alex`,
          }),
        ],
        knowledgeBaseContent: null,
        expected:
          "Acknowledges the problem and commits to looking into it, possibly asking for a useful detail.",
        criterion: {
          name: "Investigates without inventing a fix",
          description:
            "The draft should acknowledge the problem and commit to investigating it. It fails if it claims the issue is already found or fixed, invents a specific cause, or hands the issue to someone else.",
        },
      },
    ];

    for (const voiceCase of cases) {
      describe(voiceCase.name, () => {
        for (let sample = 1; sample <= SAMPLES; sample++) {
          test.concurrent(
            `sample ${sample}`,
            async () => {
              const result = await draftForEval({
                messages: voiceCase.messages.map((message) => ({
                  ...message,
                  date: new Date("2026-05-12T08:00:00Z"),
                })),
                emailAccount: {
                  ...emailAccount,
                  about:
                    voiceCase.about === undefined
                      ? emailAccount.about
                      : voiceCase.about,
                },
                knowledgeBaseContent: voiceCase.knowledgeBaseContent,
                emailHistorySummary: null,
                emailHistoryContext: null,
                calendarAvailability: null,
                writingStyle: voiceCase.writingStyle ?? null,
                mcpContext: null,
                meetingContext: null,
              });

              const judgeResult = await judgeEvalOutput({
                input: result.modelEvidence,
                output: result.reply,
                expected: voiceCase.expected,
                criterion: voiceCase.criterion,
              });

              evalReporter.record({
                testName: `${voiceCase.name} #${sample}`,
                model: model.label,
                pass: judgeResult.pass,
                expected: voiceCase.expected,
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

type VoiceCase = {
  name: string;
  about?: string | null;
  writingStyle?: string;
  messages: ReturnType<typeof getEmail>[];
  knowledgeBaseContent: string | null;
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
