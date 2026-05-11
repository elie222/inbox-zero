import { afterAll, describe, expect, test } from "vitest";
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

// EVAL_MODELS=gpt-5.4-mini pnpm test-ai eval/reply-memory
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/reply-memory

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
      "does not learn one-off operational attachment details",
      async () => {
        const incomingEmailContent =
          "Can you send the invoice for my course registration? I need it for reimbursement.";
        const draftText =
          "Thanks for reaching out. I will look into this and follow up shortly.";
        const sentText = "I attached it here for this registration.";

        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount: replyMemoryEmailAccount,
          incomingEmailContent,
          draftText,
          sentText,
          senderEmail: "learner@example.com",
          existingMemories: [],
        });
        const createdMemories = getCreatedMemoriesFromDecisions(result);
        const summary = summarizeMemories(createdMemories);

        const judgeResult = await judgeBinary({
          input: buildJudgeInput({
            incomingEmailContent,
            draftText,
            sentText,
          }),
          output: summary,
          expected:
            "No durable reply memory. The edit only adds a one-off operational fact that the requested document is attached for this specific registration.",
          criterion: {
            name: "One-off operational details are ignored",
            description:
              "The extractor should not store current-thread actions, attachments, IDs, addresses, or status updates as durable reply memories unless the edit reveals a reusable policy or procedure.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass = createdMemories.length === 0 && judgeResult.pass;

        evalReporter.record({
          testName: "one-off attachment detail ignored",
          model: model.label,
          pass,
          expected: "no memory",
          actual: formatJudgeActual(summary, judgeResult),
          criteria: [judgeResult],
        });

        expect(createdMemories.length).toBe(0);
        expect(judgeResult.pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "does not learn a one-time event refund amount as policy",
      async () => {
        const incomingEmailContent =
          "I expected the full event package, but the format changed. Can I get a refund for the difference?";
        const draftText =
          "Thanks for reaching out. I can confirm the event is still happening as planned.";
        const sentText =
          "As a one-time exception, we can refund $25 for this event because tonight's venue setup changed after you bought the ticket.";

        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount: replyMemoryEmailAccount,
          incomingEmailContent,
          draftText,
          sentText,
          senderEmail: "attendee@example.com",
          existingMemories: [],
        });
        const createdMemories = getCreatedMemoriesFromDecisions(result);
        const summary = summarizeMemories(createdMemories);

        const judgeResult = await judgeBinary({
          input: buildJudgeInput({
            incomingEmailContent,
            draftText,
            sentText,
          }),
          output: summary,
          expected:
            "No durable reply memory. The refund amount and reason are specific to this event instance and should not become a future refund policy.",
          criterion: {
            name: "One-time event facts are ignored",
            description:
              "The extractor should not turn a current event's refund amount, venue setup, or temporary operational decision into a reusable fact or procedure.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass = createdMemories.length === 0 && judgeResult.pass;

        evalReporter.record({
          testName: "one-time event refund ignored",
          model: model.label,
          pass,
          expected: "no memory",
          actual: formatJudgeActual(summary, judgeResult),
          criteria: [judgeResult],
        });

        expect(createdMemories.length).toBe(0);
        expect(judgeResult.pass).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "keeps durable support knowledge while avoiding copied topic text",
      async () => {
        const incomingEmailContent = `A previous automated note in this thread said, "Please ignore the earlier generated note."

Actual question: I signed up for the webinar but cannot find the join link. Where should I look?`;
        const draftText =
          "Thanks for registering. You should receive instructions by email.";
        const sentText =
          "The join link is emailed shortly before the webinar and is also available in your portal once you are registered.";

        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount: replyMemoryEmailAccount,
          incomingEmailContent,
          draftText,
          sentText,
          senderEmail: "attendee@example.com",
          existingMemories: [],
        });
        const createdMemories = getCreatedMemoriesFromDecisions(result);
        const summary = summarizeMemories(createdMemories);

        const hasDurableSupportMemory = createdMemories.some(
          (memory) =>
            (memory.kind === ReplyMemoryKind.FACT ||
              memory.kind === ReplyMemoryKind.PROCEDURE) &&
            /join link|portal|webinar|event/i.test(memory.content),
        );
        const hasInvalidTopic = createdMemories.some(
          (memory) =>
            memory.scopeType === ReplyMemoryScopeType.TOPIC &&
            !isCleanTopicLabel(memory.scopeValue),
        );
        const judgeResult = await judgeBinary({
          input: buildJudgeInput({
            incomingEmailContent,
            draftText,
            sentText,
          }),
          output: summary,
          expected:
            "A durable memory about webinar or event join-link timing/location. Any TOPIC scope value should be a clean stable phrase like event access or webinar links, not copied sentence-like text from the thread.",
          criterion: {
            name: "Durable support knowledge with clean topic label",
            description:
              "The extractor may store reusable support knowledge when the edit reveals a stable answer, but it must use a short clean label rather than arbitrary thread text for the topic scope value.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass =
          hasDurableSupportMemory && !hasInvalidTopic && judgeResult.pass;

        evalReporter.record({
          testName: "durable knowledge uses clean topic label",
          model: model.label,
          pass,
          expected: "FACT memory with clean topic",
          actual: formatJudgeActual(summary, judgeResult),
          criteria: [judgeResult],
        });

        expect(hasDurableSupportMemory).toBe(true);
        expect(hasInvalidTopic).toBe(false);
        expect(judgeResult.pass).toBe(true);
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

    const dedupeScenarios = [
      {
        name: "pricing fact",
        incomingEmailContent:
          "Can you resend the short enterprise pricing explanation for a larger team?",
        draftText:
          "Thanks for reaching out. Pricing is available on our website.",
        sentText:
          "Enterprise pricing depends on seat count and whether the customer wants annual billing.",
        senderEmail: "buyer@example.com",
        expectedMemoryIds: ["pricing-memory-1"],
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
      },
      {
        name: "concise support preference",
        incomingEmailContent:
          "I tried signing in again and it still is not working. What should I do next?",
        draftText:
          "Hi there, thanks so much for letting us know. I am sorry that this is still giving you trouble. Could you please try signing in again and tell me exactly what error you see when you click the button?",
        sentText: "Try signing in again and tell me what error you see.",
        senderEmail: "customer@example.com",
        expectedMemoryIds: ["concise-support-preference"],
        existingMemories: [
          {
            id: "concise-support-preference",
            content:
              "For simple support replies, keep the message very brief and direct, with at most one clear next step or key detail.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          },
        ],
      },
      {
        name: "brief refund procedure",
        incomingEmailContent:
          "I changed my RSVP and want to confirm whether the refund is handled.",
        draftText:
          "Thanks for reaching out. I checked your account and can confirm that your refund has been processed. You should see it appear back on your original payment method soon.",
        sentText: "The refund has been processed.",
        senderEmail: "attendee@example.com",
        expectedMemoryIds: [
          "brief-refund-procedure",
          "concise-status-preference",
        ],
        existingMemories: [
          {
            id: "concise-status-preference",
            content:
              "For routine status replies, keep the message extremely brief and direct, focusing only on the core answer without filler.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          },
          {
            id: "brief-refund-procedure",
            content:
              "For refund replies, keep the answer brief and direct, stating the refund status first and only adding timing details if needed.",
            kind: ReplyMemoryKind.PROCEDURE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          },
        ],
      },
      {
        name: "event access topic fact",
        incomingEmailContent:
          "I registered for tonight but cannot find the link. Where do I join?",
        draftText:
          "Thanks for registering. You should receive instructions by email.",
        sentText:
          "The join link is emailed before the event and is also available in your portal once you are registered.",
        senderEmail: "attendee@example.com",
        expectedMemoryIds: ["event-access-memory"],
        existingMemories: [
          {
            id: "event-access-memory",
            content:
              "For event access questions, tell users the join link is emailed shortly before the event and is also available in the portal once they are registered.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "event access",
          },
        ],
      },
      {
        name: "event cancellation fact",
        incomingEmailContent:
          "Earlier in the thread you said schedules were going out today. I just realized I cannot attend tonight. Can you cancel me and avoid the fee?",
        draftText: "I can cancel your spot and make sure no fee is applied.",
        sentText:
          "It is too late to cancel because schedules have already been sent out.",
        senderEmail: "attendee@example.com",
        expectedMemoryIds: ["event-cancellation-memory"],
        existingMemories: [
          {
            id: "event-cancellation-memory",
            content:
              "For event cancellation questions, say directly that it is too late to cancel if schedules have already been sent out.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "event cancellations",
          },
        ],
      },
      {
        name: "preference update procedure",
        incomingEmailContent:
          "Following up on my earlier note: I changed my age range and location preferences in the portal. Will this affect the matches I already received or only future events?",
        draftText:
          "Thanks for updating your preferences. Those changes are saved.",
        sentText:
          "Your updated preferences will be used for future matches, but they will not change matches that were already sent.",
        senderEmail: "attendee@example.com",
        expectedMemoryIds: ["preference-update-memory"],
        existingMemories: [
          {
            id: "preference-update-memory",
            content:
              "When a user updates matching preferences, explain briefly whether the change affects future matches only or also already-sent matches.",
            kind: ReplyMemoryKind.PROCEDURE,
            scopeType: ReplyMemoryScopeType.TOPIC,
            scopeValue: "preference updates",
          },
        ],
      },
      {
        name: "match criteria fact",
        incomingEmailContent:
          "Can you explain why I was matched with this person? I thought my preferences were different, and I want to understand what you considered.",
        draftText: "We use your profile to find suitable matches.",
        sentText:
          "Matching is based on age, location, and religious preferences.",
        senderEmail: "member@example.com",
        expectedMemoryIds: ["match-criteria-memory"],
        existingMemories: [
          {
            id: "match-criteria-memory",
            content:
              "When answering questions about matches, mention that matching is based on age, location, and religious preferences.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          },
        ],
      },
      {
        name: "portal login fact",
        incomingEmailContent:
          "I am trying to sign up from the email thread but cannot find the form anymore. Is there somewhere else I should go?",
        draftText: "Please use the event page to finish signing up.",
        sentText:
          "Log in to the portal to finish signing up: https://example.com/login.",
        senderEmail: "member@example.com",
        expectedMemoryIds: ["portal-login-memory"],
        existingMemories: [
          {
            id: "portal-login-memory",
            content: "For sign-ups, direct users to the portal login link.",
            kind: ReplyMemoryKind.FACT,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          },
        ],
      },
      {
        name: "short confirmation style",
        incomingEmailContent:
          "Just confirming that you got my updated form and that there is nothing else I need to do before tonight.",
        draftText:
          "Hi! Thanks so much for following up. I can confirm that we received your updated form and there is nothing else you need to do at this time. Best,",
        sentText: "We received your updated form. Nothing else is needed.",
        senderEmail: "attendee@example.com",
        expectedMemoryIds: ["short-confirmation-preference"],
        existingMemories: [
          {
            id: "short-confirmation-preference",
            content:
              "For short confirmation replies, keep the message to one brief sentence and avoid greetings, sign-offs, and extra explanation.",
            kind: ReplyMemoryKind.PREFERENCE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          },
        ],
      },
      {
        name: "wrong address procedure",
        incomingEmailContent:
          "This message is part of a longer support thread, but it looks like the last reply was sent to the wrong team inbox. Should we keep handling it here?",
        draftText: "Thanks for reaching out. We can continue helping you here.",
        sentText:
          "This was sent here by mistake, so please ignore this thread.",
        senderEmail: "teammate@example.com",
        expectedMemoryIds: ["wrong-address-memory"],
        existingMemories: [
          {
            id: "wrong-address-memory",
            content:
              "When replying to a message sent to the wrong address, briefly say it was sent by mistake and avoid continuing the thread.",
            kind: ReplyMemoryKind.PROCEDURE,
            scopeType: ReplyMemoryScopeType.GLOBAL,
            scopeValue: "",
          },
        ],
      },
    ];

    test.each(dedupeScenarios)(
      "matches existing reply memories instead of creating duplicates: $name",
      async ({
        name,
        incomingEmailContent,
        draftText,
        sentText,
        senderEmail,
        existingMemories,
        expectedMemoryIds,
      }) => {
        const result = await aiExtractReplyMemoriesFromDraftEdit({
          emailAccount: replyMemoryEmailAccount,
          incomingEmailContent,
          draftText,
          sentText,
          senderEmail,
          existingMemories,
        });

        const pass = matchesOnlyExistingMemoryIds(result, expectedMemoryIds);

        evalReporter.record({
          testName: `dedupe existing memory: ${name}`,
          model: model.label,
          pass,
          expected: expectedMemoryIds.join(", "),
          actual: summarizeDecisions(result),
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
        const conciseStyleEvidence = [
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
        ];
        const learnedWritingStyle = await aiSummarizeLearnedWritingStyle({
          preferenceMemoryEvidence:
            buildPreferenceMemoryEvidence(conciseStyleEvidence),
          emailAccount: replyMemoryEmailAccount,
        });
        const hasActionableShape =
          learnedWritingStyle.includes("Actionable rules:") &&
          learnedWritingStyle.includes("Before/after patterns:") &&
          /one|1|sentence|brief|short|terse/i.test(learnedWritingStyle) &&
          /greeting|sign[- ]?off|ceremony/i.test(learnedWritingStyle);

        const judgeResult = await judgeBinary({
          input: [
            "## Style Evidence",
            buildPreferenceMemoryEvidence(conciseStyleEvidence),
          ].join("\n"),
          output: learnedWritingStyle,
          expected:
            "A compact learned writing style summary with actionable drafting constraints and short before/after patterns. It should capture brevity, low ceremony, and plain wording without copying full email text.",
          criterion: {
            name: "Learned writing style summary quality",
            description:
              "The summary should distill repeated evidence into an account-level style guide with concrete instructions that can change future drafts, such as sentence count, greeting/sign-off habits, filler removal, and concise before/after patterns.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass = hasActionableShape && judgeResult.pass;

        evalReporter.record({
          testName: "learned style summary quality",
          model: model.label,
          pass,
          expected:
            "actionable learned writing style with before/after patterns",
          actual: formatJudgeActual(learnedWritingStyle, judgeResult),
          criteria: [judgeResult],
        });

        expect(hasActionableShape).toBe(true);
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
      "learns and applies writing style from repeated draft edits end to end",
      async () => {
        const styleLearningExamples = [
          {
            incomingEmailContent:
              "Just checking whether you received my note and whether I need to send anything else.",
            draftText:
              "Hi there! Thanks so much for checking in. I wanted to let you know that I received your note and there is nothing else you need to send right now. Best,",
            sentText: "Got it. Nothing else is needed.",
            senderEmail: "sender-one@example.com",
          },
          {
            incomingEmailContent:
              "Can you confirm whether the form update went through?",
            draftText:
              "Hi! Thanks for following up. I checked and can confirm that your form update went through successfully, so you should be all set now.",
            sentText: "Your form update went through. You are all set.",
            senderEmail: "sender-two@example.com",
          },
          {
            incomingEmailContent:
              "Following up here because I wanted to see if there is any update on this.",
            draftText:
              "Thanks so much for the follow-up. I appreciate your patience and wanted to let you know that I am still reviewing this and will get back to you soon.",
            sentText: "Still reviewing this. I will get back to you soon.",
            senderEmail: "sender-three@example.com",
          },
        ];

        const extractedPreferenceEvidence = (
          await Promise.all(
            styleLearningExamples.map(async (example) => {
              const decisions = await aiExtractReplyMemoriesFromDraftEdit({
                emailAccount: replyMemoryEmailAccount,
                incomingEmailContent: example.incomingEmailContent,
                draftText: example.draftText,
                sentText: example.sentText,
                senderEmail: example.senderEmail,
                existingMemories: [],
              });
              const preferenceMemory = getCreatedMemoriesFromDecisions(
                decisions,
              ).find((memory) => memory.kind === ReplyMemoryKind.PREFERENCE);

              if (!preferenceMemory) return null;

              return {
                content: preferenceMemory.content,
                draftText: example.draftText,
                sentText: example.sentText,
              };
            }),
          )
        ).filter(isDefined);

        const learnedWritingStyle = extractedPreferenceEvidence.length
          ? await aiSummarizeLearnedWritingStyle({
              preferenceMemoryEvidence: buildPreferenceMemoryEvidence(
                extractedPreferenceEvidence,
              ),
              emailAccount: replyMemoryEmailAccount,
            })
          : "";

        const messages = [
          {
            ...getEmail({
              from: "sender-four@example.com",
              to: emailAccount.email,
              subject: "Quick confirmation",
              content:
                "Hi, just checking that you saw my note about the deck. No action needed yet, just wanted to confirm it came through.",
            }),
            date: new Date("2026-03-17T13:00:00Z"),
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
          input: [
            "## Extracted Preference Evidence",
            buildPreferenceMemoryEvidence(extractedPreferenceEvidence),
            "",
            "## Learned Writing Style",
            learnedWritingStyle,
            "",
            buildLearnedWritingStyleComparisonInput({
              emailContent: messages[0].content,
              withoutLearnedStyleReply: withoutLearnedStyle.reply,
              learnedWritingStyle,
            }),
          ].join("\n"),
          output: withLearnedStyle.reply,
          expected:
            "A terse direct acknowledgement that applies the learned style from prior edits: no greeting or sign-off, no warm filler, one or two short sentences, and only the core confirmation.",
          criterion: {
            name: "End-to-end learned style pipeline",
            description:
              "Repeated concise edits should produce preference memories, compact into actionable learned writing style, and make a later draft noticeably terse and low ceremony.",
          },
          judgeUserAi: getEvalJudgeUserAi(),
        });
        const pass =
          extractedPreferenceEvidence.length >= 1 &&
          !!learnedWritingStyle.trim() &&
          judgeResult.pass;

        evalReporter.record({
          testName: "learned style end-to-end pipeline",
          model: model.label,
          pass,
          expected:
            "preference extraction -> learned style -> terse future draft",
          actual: formatLearnedWritingStyleActual({
            withoutLearnedStyleReply: withoutLearnedStyle.reply,
            withLearnedStyleReply: withLearnedStyle.reply,
            judgeResult,
          }),
          criteria: [judgeResult],
        });

        expect(extractedPreferenceEvidence.length).toBeGreaterThanOrEqual(1);
        expect(learnedWritingStyle.trim()).not.toBe("");
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

function matchesOnlyExistingMemoryIds(
  decisions: Awaited<ReturnType<typeof aiExtractReplyMemoriesFromDraftEdit>>,
  expectedMemoryIds: string[],
) {
  const actualMemoryIds = decisions
    .map((decision) => decision.matchingExistingMemoryId)
    .filter(isDefined);

  return (
    decisions.length === expectedMemoryIds.length &&
    decisions.every((decision) => decision.newMemory === null) &&
    expectedMemoryIds.every((id) => actualMemoryIds.includes(id))
  );
}

function summarizeDecisions(
  decisions: Awaited<ReturnType<typeof aiExtractReplyMemoriesFromDraftEdit>>,
) {
  if (!decisions.length) return "none";

  return decisions
    .map((decision) => {
      if (decision.matchingExistingMemoryId) {
        return `existing:${decision.matchingExistingMemoryId}`;
      }

      if (decision.newMemory) {
        return `new:${summarizeMemories([decision.newMemory])}`;
      }

      return "empty";
    })
    .join(" || ");
}

function isCleanTopicLabel(value: string) {
  const normalizedTopic = value.trim();
  if (!normalizedTopic) return false;
  if (normalizedTopic.length > 80) return false;
  if (normalizedTopic.split(/ +/).length > 10) return false;

  return /^[\p{L}\p{N}][\p{L}\p{N} /&+-]*$/u.test(normalizedTopic);
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
