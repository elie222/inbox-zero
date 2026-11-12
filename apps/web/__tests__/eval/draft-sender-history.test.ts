import { afterAll, describe, expect, test, vi } from "vitest";
import { getMockMessage, createTestLogger } from "@/__tests__/helpers";
import { judgeMultiple } from "@/__tests__/eval/judge";
import { getEvalJudgeUserAi } from "@/__tests__/eval/judge-provider";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import type { EmailProvider, EmailThread } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { fetchMessagesAndGenerateDraft } from "@/utils/reply-tracker/generate-draft";

// Runs the full draft pipeline, so past mail with the sender reaches the
// drafter the same way it does in production.
// pnpm test-ai eval/draft-sender-history

vi.mock("server-only", () => ({}));

vi.mock("@/utils/redis/reply", () => ({
  getReplyWithConfidence: vi.fn().mockResolvedValue(null),
  getReply: vi.fn().mockResolvedValue(null),
  saveReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn().mockResolvedValue({
        allowHiddenAiDraftLinks: false,
        includeReferralSignature: false,
        signature: null,
        learnedWritingStyle: null,
      }),
    },
    knowledge: { findMany: vi.fn().mockResolvedValue([]) },
    bookingLink: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/utils/ai/reply/reply-memory", () => ({
  getReplyMemoriesForPrompt: vi.fn().mockResolvedValue({
    content: null,
    selectedMemories: [],
  }),
}));

vi.mock("@/utils/ai/reply/reply-context-collector", () => ({
  aiCollectReplyContext: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/ai/calendar/availability", () => ({
  aiGetCalendarAvailability: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/user/get", () => ({
  getWritingStyle: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/ai/mcp/mcp-agent", () => ({
  mcpAgent: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/meeting-briefs/recipient-context", () => ({
  getMeetingContext: vi.fn().mockResolvedValue([]),
  formatMeetingContextForPrompt: vi.fn().mockReturnValue(null),
}));

vi.mock("@/utils/meeting-recorder/reply-context", () => ({
  getRecordedMeetingContext: vi.fn().mockResolvedValue([]),
  formatRecordedMeetingContextForPrompt: vi.fn().mockReturnValue(null),
}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 120_000;
const logger = createTestLogger();
const SENDER = "Dana Weller <dana@northfield-supply.example>";
const DELIVERY_DATE = daysFromNow(10);
const DELIVERY_DAY = DELIVERY_DATE.toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

describe.runIf(shouldRunEval)("draft sender history eval", () => {
  const evalReporter = createEvalReporter({
    evalName: "draft-sender-history",
  });

  describeEvalMatrix("draft sender history", (model, emailAccount) => {
    test(
      "uses a detail the sender gave in an earlier thread",
      async () => {
        const earlier = message({
          id: "earlier-1",
          threadId: "earlier-thread",
          from: SENDER,
          to: emailAccount.email,
          subject: "Order NS-4471 shipping update",
          body: `Hi, quick update: order NS-4471 (40 pallet racks) is booked to arrive at your Leipzig warehouse on ${DELIVERY_DAY}, between 8 and 11am. Best, Dana`,
          date: daysFromNow(-6).toISOString(),
        });
        const current = message({
          id: "current-1",
          threadId: "current-thread",
          from: SENDER,
          to: emailAccount.email,
          subject: "Receiving dock",
          body: "Hi, can you confirm someone will be at the dock to receive the racks on the day and time I gave you? Thanks, Dana",
          date: daysFromNow(-1).toISOString(),
        });

        const draft = await draftReply({
          emailAccount,
          current,
          senderThreads: [thread("earlier-thread", [earlier])],
        });

        const judged = await judgeMultiple({
          input: [earlier, current].map(formatForJudge).join("\n\n---\n\n"),
          output: draft,
          criteria: [
            {
              name: "States the earlier delivery slot",
              description: `The draft states the specific delivery slot the sender gave in the earlier email (${DELIVERY_DAY}, 8-11am). It fails if it only refers to it vaguely (for example "the scheduled time" or "the day you gave"), asks the sender what it was, leaves a placeholder, or states a different day or time.`,
            },
          ],
          judgeUserAi: getEvalJudgeUserAi(),
        });

        evalReporter.record({
          testName: "uses earlier sender detail",
          model: model.label,
          pass: judged.allPassed,
          criteria: judged.results,
          actual: draft,
        });
        expect(judged.allPassed).toBe(true);
      },
      TIMEOUT,
    );

    test(
      "keeps unrelated past mail with the sender out of the draft",
      async () => {
        const earlier = message({
          id: "earlier-2",
          threadId: "earlier-invoice-thread",
          from: SENDER,
          to: emailAccount.email,
          subject: "Invoice NS-3920 overdue",
          body: "Hi, invoice NS-3920 for $2,340 is now 15 days overdue. Could you check with accounts payable? Dana",
          date: daysFromNow(-40).toISOString(),
        });
        const current = message({
          id: "current-2",
          threadId: "current-catalog-thread",
          from: SENDER,
          to: emailAccount.email,
          subject: "New catalog",
          body: "Hi, would you like me to send over our spring catalog? It has the new shelving range. Dana",
          date: daysFromNow(-1).toISOString(),
        });

        const draft = await draftReply({
          emailAccount,
          current,
          senderThreads: [thread("earlier-invoice-thread", [earlier])],
        });

        const judged = await judgeMultiple({
          input: [earlier, current].map(formatForJudge).join("\n\n---\n\n"),
          output: draft,
          criteria: [
            {
              name: "Stays on the current topic",
              description:
                "The draft answers the catalog question and does not bring up the earlier invoice, an amount owed, or payment status, since the current email is not about them.",
            },
          ],
          judgeUserAi: getEvalJudgeUserAi(),
        });

        evalReporter.record({
          testName: "keeps unrelated history out",
          model: model.label,
          pass: judged.allPassed,
          criteria: judged.results,
          actual: draft,
        });
        expect(judged.allPassed).toBe(true);
      },
      TIMEOUT,
    );
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

async function draftReply({
  emailAccount,
  current,
  senderThreads,
}: {
  emailAccount: Parameters<typeof fetchMessagesAndGenerateDraft>[0];
  current: ParsedMessage;
  senderThreads: EmailThread[];
}) {
  const allThreads = [thread(current.threadId, [current]), ...senderThreads];
  const allMessages = allThreads.flatMap((t) => t.messages);
  const provider = {
    getThreadMessages: vi.fn(async (threadId: string) =>
      allMessages.filter((m) => m.threadId === threadId),
    ),
    getThreadsWithParticipant: vi.fn(async () => allThreads),
    // Older code paths batch-fetch messages by ID.
    getPreviousConversationMessages: vi.fn(async (ids: string[]) =>
      allMessages.filter((m) => ids.includes(m.id)),
    ),
    isSentMessage: vi.fn((m: ParsedMessage) => !!m.labelIds?.includes("SENT")),
  } as unknown as EmailProvider;

  const draft = await fetchMessagesAndGenerateDraft(
    emailAccount,
    current.threadId,
    provider,
    undefined,
    logger,
  );
  return draft;
}

function message({
  id,
  threadId,
  from,
  to,
  subject,
  body,
  date,
}: {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
}): ParsedMessage {
  return {
    ...getMockMessage({
      id,
      threadId,
      from,
      to,
      subject,
      snippet: body.slice(0, 100),
      textPlain: body,
      textHtml: `<p>${body}</p>`,
      labelIds: ["INBOX"],
      date,
    }),
    internalDate: String(new Date(date).getTime()),
  } as ParsedMessage;
}

function thread(id: string, messages: ParsedMessage[]): EmailThread {
  return { id, messages, snippet: messages[0]?.snippet ?? "" };
}

function formatForJudge(m: ParsedMessage) {
  return `From: ${m.headers.from}\nDate: ${m.headers.date}\nSubject: ${m.headers.subject}\n\n${m.textPlain}`;
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
