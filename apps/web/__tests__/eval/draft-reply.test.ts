import { afterAll, describe, expect, test, vi } from "vitest";
import { aiDraftReplyWithConfidence } from "@/utils/ai/reply/draft-reply";
import { getEmail } from "@/__tests__/helpers";
import { judgeMultiple } from "@/__tests__/eval/judge";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  getEvalJudgeUserAi,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";

// pnpm test-ai eval/draft-reply

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 90_000;

vi.mock("server-only", () => ({}));

describe.runIf(shouldRunEval)("draft-reply eval", () => {
  const evalReporter = createEvalReporter();

  describeEvalMatrix("draft quality", (model, emailAccount) => {
    const bookingLink = "https://cal.example.com/founder";
    const emailAccountWithBookingLink = {
      ...emailAccount,
      calendarBookingLink: bookingLink,
    };

    describe("scheduling aggressiveness (should not offer times)", () => {
      test(
        "marketing email with booking CTA — should not offer specific times",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Lisa from MindfulPath <lisa@product.mindfulpath.com>",
                to: emailAccountWithBookingLink.email,
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
            emailAccount: emailAccountWithBookingLink,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "marketing email with booking CTA";
          const judgeResult = await judgeEvalOutput({
            input: messages
              .map((message) => message.content)
              .join("\n\n---\n\n"),
            output: result.reply,
            expected:
              "A short reply that stays grounded in the email and does not propose specific meeting dates, times, time ranges, or the user's booking link.",
            criterion: {
              name: "No invented meeting times",
              description:
                "The draft should not suggest specific meeting slots, time ranges, or the user's booking link when the incoming email already provides a booking link and does not ask for manual scheduling.",
            },
          });
          const pass =
            judgeResult.pass && !hasExactUrl(result.reply, bookingLink);

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "no specific times or user booking link",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(
            pass,
            `Draft should not add the user's booking link.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
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
                to: emailAccountWithBookingLink.email,
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
            emailAccount: emailAccountWithBookingLink,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "booking link email";
          const judgeResult = await judgeEvalOutput({
            input: messages
              .map((message) => message.content)
              .join("\n\n---\n\n"),
            output: result.reply,
            expected:
              "A reply that acknowledges the outreach without inventing specific meeting dates or times or adding the user's booking link, since the sender already provided a booking link.",
            criterion: {
              name: "Booking link respected",
              description:
                "The draft should avoid proposing specific meeting slots or adding the user's booking link when the email already contains a booking link and no calendar availability was provided.",
            },
          });
          const pass =
            judgeResult.pass && !hasExactUrl(result.reply, bookingLink);

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "no specific times or user booking link",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(
            pass,
            `Draft should not add the user's booking link.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
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
              date: new Date("2027-03-10T14:00:00Z"),
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
                { start: "2027-03-12 10:00", end: "2027-03-12 10:30" },
                { start: "2027-03-12 14:00", end: "2027-03-12 14:30" },
              ],
            },
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "genuine scheduling request";
          const judgeResult = await judgeEvalOutput({
            input: [
              messages.map((message) => message.content).join("\n\n---\n\n"),
              "",
              "## Calendar Availability",
              JSON.stringify(
                {
                  suggestedTimes: [
                    { start: "2027-03-12 10:00", end: "2027-03-12 10:30" },
                    { start: "2027-03-12 14:00", end: "2027-03-12 14:30" },
                  ],
                },
                null,
                2,
              ),
            ].join("\n"),
            output: result.reply,
            expected:
              "A substantive scheduling reply that meaningfully advances the meeting, either by using the provided calendar availability or by asking for updated availability if the suggested times appear stale.",
            criterion: {
              name: "Substantive scheduling reply",
              description:
                "When the sender explicitly asks to schedule and calendar availability is provided, the draft should be a meaningful scheduling response rather than a blank or evasive reply. It may either propose the provided slots or ask for updated availability if those slots appear outdated.",
            },
          });
          const pass = judgeResult.pass;

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "substantive draft",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(judgeResult.pass).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "explicit support preference may include booking link",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Jordan Blake <jordan@example.com>",
                to: emailAccountWithBookingLink.email,
                subject: "Setup issue",
                content: `Hey,

I'm stuck getting the archive rules to work with my Outlook account. It keeps leaving some threads in the inbox even after the rule runs.

Can you help me figure out what's going on?

Thanks,
Jordan`,
              }),
              date: new Date("2026-04-29T12:15:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount: emailAccountWithBookingLink,
            knowledgeBaseContent:
              "For troubleshooting where a screen share would help, the user prefers to include their booking link.",
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle:
              "Reply preference: when a support issue would be easier to debug on a call, include my booking link.",
            mcpContext: null,
            meetingContext: null,
          });

          const pass = hasExactUrl(result.reply, bookingLink);
          const testName = "support preference includes booking link";

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected:
              "booking link included because user preference asks for it",
            actual: `reply=${JSON.stringify(result.reply)}`,
          });

          expect(
            pass,
            `Draft should include the user's booking link when an explicit preference asks for it.\n\nReply:\n${result.reply}`,
          ).toBe(true);
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
                to: emailAccountWithBookingLink.email,
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
            emailAccount: emailAccountWithBookingLink,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "non-scheduling question";
          const judgeResult = await judgeEvalOutput({
            input: messages
              .map((message) => message.content)
              .join("\n\n---\n\n"),
            output: result.reply,
            expected:
              "A grounded reply that addresses the question without offering specific meeting dates, times, or the user's booking link.",
            criterion: {
              name: "No scheduling drift",
              description:
                "For a non-scheduling question, the draft should not drift into proposing calendar times, meeting slots, or the user's booking link.",
            },
          });
          const pass =
            judgeResult.pass && !hasExactUrl(result.reply, bookingLink);

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "no specific times or user booking link",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(
            pass,
            `Draft should not add the user's booking link.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "product setup question — should not append a setup call",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Nina Patel <nina@example.com>",
                to: emailAccountWithBookingLink.email,
                subject: "Question about routing and language support",
                content: `Hi,

Can Inbox Zero move emails into specific folders or tabs automatically?

Also, does the AI work for non-English emails, or only English?

Thanks,
Nina`,
              }),
              date: new Date("2026-04-29T16:20:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount: emailAccountWithBookingLink,
            knowledgeBaseContent: [
              "Inbox Zero can create automated rules to route emails to labels, folders, or tabs.",
              "The AI can draft and classify emails in the language of the latest message.",
            ].join("\n"),
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "product setup question";
          const judgeResult = await judgeEvalOutput({
            input: messages
              .map((message) => message.content)
              .join("\n\n---\n\n"),
            output: result.reply,
            expected:
              "A direct product answer about routing and language support that does not append a setup call, meeting invitation, or the user's booking link.",
            criterion: {
              name: "No appended setup call",
              description:
                "For product capability questions that can be answered from the provided knowledge, the draft should answer directly and avoid adding a call CTA or the user's booking link.",
            },
          });
          const pass =
            judgeResult.pass && !hasExactUrl(result.reply, bookingLink);

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "direct answer without booking link",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(
            pass,
            `Draft should not append a setup call or booking link.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
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

    describe("confidence calibration", () => {
      test(
        "missing business context is not high confidence",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Dana Lee <dana@clientcorp.com>",
                to: emailAccount.email,
                subject: "Security questionnaire",
                content: `Hi,

Could you send the final security questionnaire answers today and confirm whether the DPA redlines are approved?

Thanks,
Dana`,
              }),
              date: new Date("2026-03-15T12:00:00Z"),
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

          const pass = result.confidence !== "HIGH_CONFIDENCE";
          const testName = "missing business context confidence";

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected:
              "STANDARD or ALL_EMAILS because the draft lacks facts needed to answer",
            actual: `confidence=${result.confidence} | reply=${JSON.stringify(result.reply)}`,
          });

          expect(
            pass,
            `Draft should not be marked high confidence without questionnaire or DPA facts.\n\nConfidence: ${result.confidence}\nReply:\n${result.reply}`,
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
          const judgeResult = await judgeEvalOutput({
            input: messages
              .map((message) => message.content)
              .join("\n\n---\n\n"),
            output: result.reply,
            expected:
              "A concise reply that does not use an em dash unless explicitly asked for by the provided context or writing style.",
            criterion: {
              name: "No default em dash",
              description:
                "The reply should avoid em dashes by default when the writing style does not call for them.",
            },
          });
          const pass = judgeResult.pass;

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "reply without em dash",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(judgeResult.pass).toBe(true);
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
  messages,
  reply,
}: {
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

function hasExactUrl(text: string, expectedUrl: string): boolean {
  const normalizedExpected = normalizeUrlForComparison(expectedUrl);

  return extractUrls(text).some(
    (url) => normalizeUrlForComparison(url) === normalizedExpected,
  );
}

function extractUrls(text: string): string[] {
  return (text.match(/https?:\/\/[^\s<>"']+/g) ?? []).map((url) =>
    url.replace(/[),.?!;:]+$/g, ""),
  );
}

function normalizeUrlForComparison(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/$/, "");

    return `${url.protocol}//${url.host}${path}${url.search}`;
  } catch {
    return value;
  }
}
