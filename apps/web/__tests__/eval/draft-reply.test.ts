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
              formatThreadForJudge(messages),
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

    describe("sender-specific reply examples", () => {
      const contactSpecificWritingStyle = [
        "Keep replies concise and direct.",
        "For close contacts, use a casual plainspoken tone.",
        "Avoid asking clarification questions unless the incoming message is genuinely ambiguous.",
      ].join("\n");

      test(
        "monthly payment status question stays concise and does not ask needless clarification",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Taylor Morgan <taylor@example.com>",
                to: emailAccount.email,
                subject: "Payment",
                content: `Hi,

Did you send the April/May payment?

thanks,`,
              }),
              date: new Date("2026-05-11T07:20:00Z"),
            },
          ];

          const sharedDraftOptions = {
            messages,
            emailAccount,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: contactSpecificWritingStyle,
            mcpContext: null,
            meetingContext: null,
          };

          const [baselineResult, result] = await Promise.all([
            aiDraftReplyWithConfidence(sharedDraftOptions),
            aiDraftReplyWithConfidence({
              ...sharedDraftOptions,
              senderReplyExamples: getStatusReplyExamples(emailAccount.email),
            }),
          ]);

          const input = formatThreadForJudge(messages);
          const paymentReplyCriterion = {
            name: "Concise contact-specific payment reply",
            description:
              "The draft should be one or two short sentences plus an optional compact greeting/sign-off. It should not ask an unnecessary clarification question or create a multi-paragraph process update. It may either say the user is checking, commit to handling it, or answer directly in the same concise style the user uses with this sender.",
          };
          const expectedPaymentReply =
            "A short, direct reply suitable for a close/contact-specific relationship. It should avoid unnecessary clarification and processy filler. A useful action-oriented reply is acceptable because the user can complete the action before sending.";
          const judgeResult = await judgeEvalOutput({
            input: [
              input,
              "",
              "## Same-sender reply examples",
              "The user usually answers this sender in very short direct replies such as 'Not yet, will do it today', 'Done now', or 'Checking and will update you.'",
            ].join("\n"),
            output: result.reply,
            expected: expectedPaymentReply,
            criterion: paymentReplyCriterion,
          });
          const pass = judgeResult.pass;

          evalReporter.record({
            testName: "monthly payment status with same-sender examples",
            model: model.label,
            pass,
            expected:
              "concise same-sender reply without needless clarification",
            actual: `${formatSemanticJudgeActual(result.reply, judgeResult)} | baseline=${JSON.stringify(baselineResult.reply)}`,
          });

          expect(
            pass,
            `Draft should stay concise and avoid needless clarification.\n\nBaseline:\n${baselineResult.reply}\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "current thread facts override conflicting same-sender examples",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: emailAccount.email,
                to: "taylor@example.com",
                subject: "Re: Payment",
                content: "I sent the April/May payment this morning.",
              }),
              date: new Date("2026-05-11T06:30:00Z"),
            },
            {
              ...getEmail({
                from: "Taylor Morgan <taylor@example.com>",
                to: emailAccount.email,
                subject: "Re: Payment",
                content: `Hi,

Did you send the April/May payment?

thanks,`,
              }),
              date: new Date("2026-05-11T07:20:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            senderReplyExamples: getStatusReplyExamples(emailAccount.email),
            calendarAvailability: null,
            writingStyle: contactSpecificWritingStyle,
            mcpContext: null,
            meetingContext: null,
          });

          const judgeResult = await judgeEvalOutput({
            input: [
              formatThreadForJudge(messages),
              "",
              "## Same-sender reply examples",
              "The examples include short prior replies with different statuses. They are style examples only.",
            ].join("\n"),
            output: result.reply,
            expected:
              "A concise reply that uses the current thread fact that the payment was sent this morning. It should not ignore that fact or copy a conflicting status from the same-sender examples.",
            criterion: {
              name: "Current thread facts override examples",
              description:
                "The draft should base factual status on the current thread. Same-sender examples may influence brevity and tone, but must not override or contradict facts stated in the current conversation.",
            },
          });
          const pass = judgeResult.pass;

          evalReporter.record({
            testName: "current thread facts override same-sender examples",
            model: model.label,
            pass,
            expected: "current-thread fact used; examples style-only",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(
            pass,
            `Draft should use current-thread facts over examples.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "unresolved document status stays concise with same-sender examples",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Taylor Morgan <taylor@example.com>",
                to: emailAccount.email,
                subject: "Form",
                content: `Hi,

Did the signed form go out?

thanks,`,
              }),
              date: new Date("2026-05-12T08:15:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount,
            knowledgeBaseContent: null,
            emailHistorySummary: null,
            emailHistoryContext: null,
            senderReplyExamples: getStatusReplyExamples(emailAccount.email),
            calendarAvailability: null,
            writingStyle: contactSpecificWritingStyle,
            mcpContext: null,
            meetingContext: null,
          });

          const judgeResult = await judgeEvalOutput({
            input: [
              formatThreadForJudge(messages),
              "",
              "## Same-sender reply examples",
              "The examples include short prior replies with different statuses. They are style examples only.",
            ].join("\n"),
            output: result.reply,
            expected:
              "A concise reply in the user's same-sender style. It may say the user is checking, will handle it, or has handled it, but should not ask an unnecessary clarification question or create a multi-paragraph process update.",
            criterion: {
              name: "Unresolved non-payment status remains concise",
              description:
                "For an unresolved status question outside the payment fixture, the draft should preserve the same-sender brevity and avoid needless clarification or processy filler. It may draft an action-oriented reply because the user can take the action before sending.",
            },
          });
          const pass = judgeResult.pass;

          evalReporter.record({
            testName: "unresolved document status with same-sender examples",
            model: model.label,
            pass,
            expected: "concise reply without needless clarification",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(
            pass,
            `Draft should stay concise and useful.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
        },
        TIMEOUT,
      );
    });

    describe("grounding and uncertainty", () => {
      test(
        "does not invent pricing terms without pricing context",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Maya Chen <maya@customer.example>",
                to: emailAccount.email,
                subject: "Pricing confirmation",
                content: `Hi,

Can you confirm the annual price and whether the discount we discussed still applies?

Thanks,
Maya`,
              }),
              date: new Date("2026-05-03T11:00:00Z"),
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

          const testName = "missing pricing context";
          const judgeResult = await judgeEvalOutput({
            input: messages
              .map((message) => message.content)
              .join("\n\n---\n\n"),
            output: result.reply,
            expected:
              "A useful editable draft that does not invent concrete pricing details such as an annual price, discount amount, signing deadline, or extra payment terms because no pricing context was provided. It must not be high confidence.",
            criterion: {
              name: "No unsupported concrete pricing details",
              description:
                "The draft must not invent concrete pricing values, discount amounts, deadlines, or extra payment terms that are not present in the input. It should stay useful as an editable draft rather than becoming a non-answer.",
            },
          });
          const pass =
            result.confidence !== "HIGH_CONFIDENCE" && judgeResult.pass;

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected:
              "no invented concrete pricing details, not high confidence",
            actual: `confidence=${result.confidence} | ${formatSemanticJudgeActual(
              result.reply,
              judgeResult,
            )}`,
          });

          expect(
            pass,
            `Draft should not invent pricing or mark high confidence without pricing context.\n\nConfidence: ${result.confidence}\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "uses supplied pricing terms when pricing context is provided",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Maya Chen <maya@customer.example>",
                to: emailAccount.email,
                subject: "Pricing confirmation",
                content: `Hi,

Can you confirm the annual price and whether the discount we discussed still applies?

Thanks,
Maya`,
              }),
              date: new Date("2026-05-03T11:00:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount,
            knowledgeBaseContent:
              "For this customer, the approved annual price is $4,800. A 15% renewal discount applies if they sign by May 31.",
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "provided pricing context";
          const judgeResult = await judgeEvalOutput({
            input: [
              formatThreadForJudge(messages),
              "",
              "## Knowledge Base",
              "For this customer, the approved annual price is $4,800. A 15% renewal discount applies if they sign by May 31.",
            ].join("\n"),
            output: result.reply,
            expected:
              "A reply that uses the supplied pricing context to answer the sender with the approved annual price, renewal discount, and signing deadline, without inventing extra pricing terms.",
            criterion: {
              name: "Pricing context used",
              description:
                "The draft should communicate the supplied annual price, discount, and deadline. It should not depend on exact wording, but it must preserve those facts and avoid unsupported additional pricing details.",
            },
          });
          const pass = judgeResult.pass;

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "$4,800, 15% discount, May 31",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(
            pass,
            `Draft should use the supplied pricing terms.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "lowers confidence when attachment context is missing",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Dana Lee <dana@clientcorp.com>",
                to: emailAccount.email,
                subject: "Signed order form",
                content: `Hi,

Can you send over the signed order form for our records?

Thanks,
Dana`,
              }),
              date: new Date("2026-05-04T09:30:00Z"),
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
          const testName = "missing attachment context";

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "not high confidence without selected attachment context",
            actual: `confidence=${result.confidence} | reply=${JSON.stringify(result.reply)}`,
          });

          expect(
            pass,
            `Draft should not be marked high confidence without selected attachment context.\n\nConfidence: ${result.confidence}\nReply:\n${result.reply}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "mentions selected attachment when attachment context is provided",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Dana Lee <dana@clientcorp.com>",
                to: emailAccount.email,
                subject: "Signed order form",
                content: `Hi,

Can you send over the signed order form for our records?

Thanks,
Dana`,
              }),
              date: new Date("2026-05-04T09:30:00Z"),
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
            attachmentContext:
              'Signed Order Form.pdf — selected because the sender asked for "the signed order form".',
          });

          const testName = "provided attachment context";
          const judgeResult = await judgeEvalOutput({
            input: [
              formatThreadForJudge(messages),
              "",
              "## Selected Attachments",
              'Signed Order Form.pdf — selected because the sender asked for "the signed order form".',
            ].join("\n"),
            output: result.reply,
            expected:
              "A reply that uses the selected attachment context to tell the sender the requested signed order form is included or available with the draft, without inventing unrelated attachments.",
            criterion: {
              name: "Selected attachment used",
              description:
                "The draft should make clear that the selected signed order form is being provided. It should not depend on exact wording, but it must refer to the relevant selected document and avoid unsupported attachment claims.",
            },
          });
          const pass = judgeResult.pass;

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "mentions attached order form",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(
            pass,
            `Draft should mention the selected attachment.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "lowers confidence when refund authority context is missing",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Riley Stone <riley@customer.example>",
                to: emailAccount.email,
                subject: "Refund approval",
                content: `Hi,

Can you approve the refund for the duplicate charge?

Thanks,
Riley`,
              }),
              date: new Date("2026-05-05T13:20:00Z"),
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
          const testName = "missing refund authority context";

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "not high confidence without refund authority context",
            actual: `confidence=${result.confidence} | reply=${JSON.stringify(result.reply)}`,
          });

          expect(
            pass,
            `Draft should not be marked high confidence without refund authority context.\n\nConfidence: ${result.confidence}\nReply:\n${result.reply}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "uses supplied refund approval context",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Riley Stone <riley@customer.example>",
                to: emailAccount.email,
                subject: "Refund approval",
                content: `Hi,

Can you approve the refund for the duplicate charge?

Thanks,
Riley`,
              }),
              date: new Date("2026-05-05T13:20:00Z"),
            },
          ];

          const result = await aiDraftReplyWithConfidence({
            messages,
            emailAccount,
            knowledgeBaseContent:
              "The duplicate charge refund for this customer is approved. Finance will process it by Friday.",
            emailHistorySummary: null,
            emailHistoryContext: null,
            calendarAvailability: null,
            writingStyle: null,
            mcpContext: null,
            meetingContext: null,
          });

          const testName = "provided refund authority context";
          const judgeResult = await judgeEvalOutput({
            input: [
              formatThreadForJudge(messages),
              "",
              "## Knowledge Base",
              "The duplicate charge refund for this customer is approved. Finance will process it by Friday.",
            ].join("\n"),
            output: result.reply,
            expected:
              "A reply that uses the supplied context to tell the sender the refund is approved and finance will process it by Friday, without inventing extra refund timing or payment details.",
            criterion: {
              name: "Refund context used",
              description:
                "The draft should communicate the approved refund and Friday processing timeline from the supplied context. It should not depend on exact wording, but it must preserve those two facts and avoid unsupported additional details.",
            },
          });
          const pass = judgeResult.pass;

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "refund approved and processed by Friday",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(
            pass,
            `Draft should use the supplied refund approval context.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
              null,
              2,
            )}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "lowers confidence when meeting context is missing",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Priya Sharma <priya@launchpad.dev>",
                to: emailAccount.email,
                subject: "Tomorrow",
                content: `Hey,

Are we still on for tomorrow?

Priya`,
              }),
              date: new Date("2026-05-06T15:00:00Z"),
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
          const testName = "missing meeting context";

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "not high confidence without meeting context",
            actual: `confidence=${result.confidence} | reply=${JSON.stringify(result.reply)}`,
          });

          expect(
            pass,
            `Draft should not be marked high confidence without meeting context.\n\nConfidence: ${result.confidence}\nReply:\n${result.reply}`,
          ).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "uses supplied meeting context to confirm a meeting",
        async () => {
          const messages = [
            {
              ...getEmail({
                from: "Priya Sharma <priya@launchpad.dev>",
                to: emailAccount.email,
                subject: "Tomorrow",
                content: `Hey,

Are we still on for tomorrow?

Priya`,
              }),
              date: new Date("2026-05-06T15:00:00Z"),
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
            meetingContext:
              "Upcoming calendar context: a meeting with Priya Sharma is scheduled for tomorrow at 3:00 PM.",
          });

          const testName = "provided meeting context";
          const judgeResult = await judgeEvalOutput({
            input: [
              formatThreadForJudge(messages),
              "",
              "## Meeting Context",
              "Upcoming calendar context: a meeting with Priya Sharma is scheduled for tomorrow at 3:00 PM.",
            ].join("\n"),
            output: result.reply,
            expected:
              "A reply that uses the supplied meeting context to confirm the meeting and preserve the scheduled time of tomorrow at 3:00 PM, without inventing a different time or unsupported meeting details.",
            criterion: {
              name: "Meeting context used",
              description:
                "The draft should confirm the meeting using the supplied calendar context. It should not depend on exact wording, but it must preserve the scheduled time and avoid unsupported scheduling details.",
            },
          });
          const pass = judgeResult.pass;

          evalReporter.record({
            testName,
            model: model.label,
            pass,
            expected: "confirms tomorrow at 3:00 PM",
            actual: formatSemanticJudgeActual(result.reply, judgeResult),
          });

          expect(
            pass,
            `Draft should use the supplied meeting context.\n\nReply:\n${result.reply}\n\nJudge: ${JSON.stringify(
              judgeResult,
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
    input: formatThreadForJudge(messages),
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

function formatThreadForJudge(messages: { content: string }[]): string {
  return messages.map((message) => message.content).join("\n\n---\n\n");
}

function getStatusReplyExamples(userEmail: string): string {
  return [
    `<reply_example>
<from>${userEmail}</from>
<to>taylor@example.com</to>
<subject>Re: quick check</subject>
<body>Not yet, will do it today.</body>
</reply_example>`,
    `<reply_example>
<from>${userEmail}</from>
<to>taylor@example.com</to>
<subject>Re: payment</subject>
<body>Done now.</body>
</reply_example>`,
    `<reply_example>
<from>${userEmail}</from>
<to>taylor@example.com</to>
<subject>Re: forms</subject>
<body>Checking and will update you.</body>
</reply_example>`,
  ].join("\n\n");
}

function extractUrls(text: string): string[] {
  const markdownLinkUrls = [
    ...text.matchAll(/\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g),
  ].map((match) => match[1]);
  const plainUrls = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];

  return [...new Set([...markdownLinkUrls, ...plainUrls])].map((url) =>
    url.replace(/[,.?!;:]+$/g, ""),
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
