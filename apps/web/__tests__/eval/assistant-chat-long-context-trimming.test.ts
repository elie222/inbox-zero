import { createHash } from "node:crypto";
import type { ModelMessage } from "ai";
import { afterAll, describe, expect, test } from "vitest";
import {
  cloneEmailAccountForProvider,
  mockGetMessage,
  mockMoveThreadToFolder,
  mockSearchMessages,
  setupInboxWorkflowEval,
  shouldRunEval,
} from "@/__tests__/eval/assistant-chat-inbox-workflows-test-utils";
import {
  captureAssistantChatTrace,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import { getMockMessage } from "@/__tests__/helpers";
import { trimStaleToolResults } from "@/utils/ai/assistant/trim-stale-tool-results";
import { createScopedLogger } from "@/utils/logger";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-long-context-trimming.test.ts
// Multi-model: EVAL_MODELS=all pnpm --filter inbox-zero-ai test-ai __tests__/eval/assistant-chat-long-context-trimming.test.ts

const TIMEOUT = 300_000;
const logger = createScopedLogger("eval-assistant-chat-long-context");
const evalReporter = createEvalReporter({
  evalName: "assistant-chat-long-context-trimming",
});

const CONTRACT_MESSAGE_ID = getOutlookStyleId("contract");
const NOTICE_PERIOD_CLAUSE =
  "Either party may terminate this agreement for convenience by giving seventy-five (75) days' prior written notice to the other party.";
const NEWSLETTERS = [
  { sender: "digest@devweekly.example", subject: "Dev Weekly #212" },
  { sender: "news@designnotes.example", subject: "Design Notes: grids" },
  { sender: "hello@marketbrief.example", subject: "Market Brief Monday" },
  { sender: "team@productletter.example", subject: "The Product Letter" },
  { sender: "editor@cloudroundup.example", subject: "Cloud Roundup" },
];

describe.runIf(shouldRunEval)(
  "Eval: assistant chat after long tool-heavy turns",
  () => {
    setupInboxWorkflowEval();

    describeEvalMatrix(
      "assistant-chat long context trimming",
      (model, emailAccount) => {
        test(
          "re-reads an email instead of guessing a detail trimmed from context",
          async () => {
            const messages: ModelMessage[] = [
              ...buildContractTurn(),
              {
                role: "user",
                content:
                  "Going back to the vendor services agreement you read at the start: how much notice do we have to give to terminate it?",
              },
            ];
            expectHistoryToBeTrimmed(messages);

            mockGetMessage.mockImplementation(async (messageId: string) => {
              if (messageId !== CONTRACT_MESSAGE_ID) {
                throw new Error("Message not found");
              }
              return getContractMessage();
            });

            const trace = await captureAssistantChatTrace({
              messages,
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                "microsoft",
              ),
              logger,
            });

            const judge = await judgeEvalOutput({
              input:
                "The user asked how much notice is required to terminate a vendor agreement. The full agreement text is:\n" +
                getContractText(),
              output: trace.finalText,
              expected: "75 days' prior written notice",
              criterion: {
                name: "Grounded contract detail",
                description:
                  "The answer states that 75 days' written notice is required, and does not invent a different period or claim the detail is unavailable.",
              },
            });

            const pass = judge.pass;
            evalReporter.record({
              testName: "re-reads trimmed email detail",
              model: model.label,
              pass,
              actual: [
                formatSemanticJudgeActual(trace.finalText, judge),
                summarizeToolCalls(trace.toolCalls),
                formatInputTokens(trace.steps),
              ].join(" | "),
            });

            expect(pass, trace.finalText).toBe(true);
          },
          TIMEOUT,
        );

        test(
          "acts on thread IDs from a search that was trimmed from context",
          async () => {
            const messages: ModelMessage[] = [
              ...buildNewsletterTurn(),
              {
                role: "user",
                content:
                  "Great. Move the newsletters you found at the very start into my Newsletters folder.",
              },
            ];
            expectHistoryToBeTrimmed(messages);

            mockSearchMessages.mockResolvedValue({
              messages: getNewsletterMessages(),
              nextPageToken: undefined,
            });

            const trace = await captureAssistantChatTrace({
              messages,
              emailAccount: cloneEmailAccountForProvider(
                emailAccount,
                "microsoft",
              ),
              logger,
            });

            const movedThreadIds = new Set(
              mockMoveThreadToFolder.mock.calls.map(([threadId]) => threadId),
            );
            const expectedThreadIds = NEWSLETTERS.map((_, index) =>
              getNewsletterThreadId(index),
            );
            const pass =
              movedThreadIds.size === expectedThreadIds.length &&
              expectedThreadIds.every((threadId) =>
                movedThreadIds.has(threadId),
              ) &&
              !trace.toolCalls.some(
                (toolCall) => toolCall.toolName === "manageInbox",
              );

            evalReporter.record({
              testName: "acts on trimmed search thread IDs",
              model: model.label,
              pass,
              actual: [
                `moved=${[...movedThreadIds].join(",")}`,
                summarizeToolCalls(trace.toolCalls),
                formatInputTokens(trace.steps),
              ].join(" | "),
            });

            expect(pass, [...movedThreadIds].join(",")).toBe(true);
          },
          TIMEOUT,
        );
      },
    );

    afterAll(() => {
      evalReporter.printReport();
    });
  },
);

function expectHistoryToBeTrimmed(messages: ModelMessage[]) {
  expect(trimStaleToolResults(messages)).not.toBe(messages);
}

function buildContractTurn(): ModelMessage[] {
  return [
    {
      role: "user",
      content:
        "Read the vendor services agreement email, then help me work through everything in my inbox from this week.",
    },
    ...toolRound("read-contract", "readEmail", {
      input: { messageId: CONTRACT_MESSAGE_ID },
      output: {
        messageId: CONTRACT_MESSAGE_ID,
        threadId: "thread-contract",
        from: "contracts@vendor.example",
        to: "user@test.com",
        subject: "Services agreement for signature",
        content: getContractText(),
        date: "2026-09-21T09:00:00.000Z",
        attachments: [],
      },
    }),
    {
      role: "assistant",
      content:
        "I've read the services agreement from the vendor. Now let me go through this week's inbox.",
    },
    ...buildInboxWorkRounds(),
    {
      role: "assistant",
      content:
        "I've gone through this week's inbox and filed the project updates.",
    },
  ];
}

function buildNewsletterTurn(): ModelMessage[] {
  return [
    {
      role: "user",
      content:
        "Find the newsletters in my inbox, then help me work through everything else from this week.",
    },
    ...toolRound("search-newsletters", "searchInbox", {
      input: { query: "newsletter" },
      output: {
        queryUsed: "newsletter",
        totalReturned: NEWSLETTERS.length,
        hasMore: false,
        messages: NEWSLETTERS.map((newsletter, index) =>
          searchResultItem({
            messageId: getNewsletterMessageId(index),
            threadId: getNewsletterThreadId(index),
            from: newsletter.sender,
            subject: newsletter.subject,
            snippet: `${newsletter.subject}: this week's top stories, links and reading list. ${FILLER_SNIPPET}`,
          }),
        ),
      },
    }),
    {
      role: "assistant",
      content: `I found ${NEWSLETTERS.length} newsletters. Now let me go through the rest of this week's inbox.`,
    },
    ...buildInboxWorkRounds(),
    {
      role: "assistant",
      content:
        "I've gone through the rest of this week's inbox and filed the project updates.",
    },
  ];
}

function buildInboxWorkRounds(): ModelMessage[] {
  return Array.from({ length: 34 }, (_, round) => [
    ...toolRound(`search-${round}`, "searchInbox", {
      input: { query: `project update week ${round}` },
      output: {
        queryUsed: `project update week ${round}`,
        totalReturned: 15,
        hasMore: false,
        messages: Array.from({ length: 15 }, (_, index) =>
          searchResultItem({
            messageId: getOutlookStyleId(`work-${round}-${index}`),
            threadId: `thread-work-${round}-${index}`,
            from: `colleague${index}@company.example`,
            subject: `Project update ${round}.${index}`,
            snippet: `Status for workstream ${round}.${index}. ${FILLER_SNIPPET}`,
          }),
        ),
      },
    }),
    ...toolRound(`read-${round}`, "readEmail", {
      input: { messageId: getOutlookStyleId(`work-${round}-0`) },
      output: {
        messageId: getOutlookStyleId(`work-${round}-0`),
        threadId: `thread-work-${round}-0`,
        from: "colleague0@company.example",
        subject: `Project update ${round}.0`,
        content: `Workstream ${round} status report. ${FILLER_BODY}`,
        date: "2026-09-22T10:00:00.000Z",
        attachments: [],
      },
    }),
    ...toolRound(`move-${round}`, "moveThreadsToFolder", {
      input: {
        threadIds: [`thread-work-${round}-0`],
        folderName: "Projects",
      },
      output: { success: true, movedCount: 1, folderName: "Projects" },
    }),
  ]).flat();
}

function toolRound(
  toolCallId: string,
  toolName: string,
  { input, output }: { input: Record<string, unknown>; output: unknown },
): ModelMessage[] {
  return [
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId, toolName, input }],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId,
          toolName,
          output: { type: "json", value: JSON.parse(JSON.stringify(output)) },
        },
      ],
    },
  ];
}

function searchResultItem({
  messageId,
  threadId,
  from,
  subject,
  snippet,
}: {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
}) {
  return {
    messageId,
    threadId,
    externalUrl: `https://outlook.office365.com/owa/?ItemID=${encodeURIComponent(messageId)}&exvsurl=1&viewmodel=ReadMessageItem`,
    subject,
    from,
    to: "user@test.com",
    snippet: snippet.slice(0, 250),
    date: "2026-09-22T10:00:00.000Z",
    categoryNames: [],
    category: "uncategorized",
    isUnread: false,
    hasAttachments: false,
  };
}

// Real Outlook IDs are long random base64 strings; repeated characters would
// test the model's ability to count rather than to reuse an identifier.
function getOutlookStyleId(seed: string) {
  const hash = createHash("sha512").update(seed).digest("base64");
  return `AAMkAD${hash}${hash}`.replace(/[+/=]/g, "A").slice(0, 140);
}

function getNewsletterMessageId(index: number) {
  return getOutlookStyleId(`newsletter-${index}`);
}

function getNewsletterThreadId(index: number) {
  return `thread-newsletter-${index}`;
}

function getNewsletterMessages() {
  return NEWSLETTERS.map((newsletter, index) =>
    getMockMessage({
      id: getNewsletterMessageId(index),
      threadId: getNewsletterThreadId(index),
      from: newsletter.sender,
      subject: newsletter.subject,
      snippet: `${newsletter.subject}: this week's top stories.`,
      labelIds: ["INBOX"],
    }),
  );
}

function getContractMessage() {
  return getMockMessage({
    id: CONTRACT_MESSAGE_ID,
    threadId: "thread-contract",
    from: "contracts@vendor.example",
    subject: "Services agreement for signature",
    snippet: "Please review and sign the attached services agreement.",
    textPlain: getContractText(),
    textHtml: getContractText()
      .split("\n\n")
      .map((paragraph) => `<p>${paragraph}</p>`)
      .join(""),
    labelIds: ["INBOX"],
  });
}

function getContractText() {
  return [
    "Please review and sign the services agreement below.",
    "1. Services. Vendor will provide managed hosting, monitoring and support services as described in Schedule A, including incident response within the service levels in Schedule B.",
    "2. Fees. Customer will pay the monthly fees in Schedule C within thirty (30) days of invoice. Late amounts accrue interest at one percent (1%) per month.",
    "3. Term. This agreement starts on the effective date and continues for an initial term of twelve (12) months, then renews automatically for successive twelve (12) month terms.",
    "4. Confidentiality. Each party will protect the other party's confidential information using at least reasonable care and will only use it to perform this agreement.",
    "5. Data protection. Vendor will process customer data only on documented instructions and will notify customer of any personal data breach without undue delay.",
    "6. Warranties. Vendor warrants that the services will be performed in a professional manner consistent with industry standards.",
    `7. Termination. ${NOTICE_PERIOD_CLAUSE} Either party may terminate immediately if the other party materially breaches this agreement and fails to cure within fifteen (15) days of notice.`,
    "8. Liability. Each party's total liability is limited to the fees paid in the twelve (12) months before the claim.",
    "9. General. This agreement is governed by the laws of the State of Delaware.",
  ].join("\n\n");
}

function summarizeToolCalls(toolCalls: RecordedToolCall[]) {
  return summarizeRecordedToolCalls(toolCalls, (toolCall) => toolCall.toolName);
}

function formatInputTokens(steps: unknown[]) {
  const inputTokens = steps.map(
    (step) =>
      (step as { usage?: { inputTokens?: number } }).usage?.inputTokens ?? 0,
  );
  return `inputTokensPerStep=${inputTokens.join(",")}`;
}

const FILLER_SNIPPET =
  "Highlights from the team this week, open questions for review, upcoming deadlines and the notes from Tuesday's sync with the design and platform groups.";
const FILLER_BODY = Array.from(
  { length: 12 },
  (_, index) =>
    `Section ${index + 1}: progress on the milestones, risks that need attention, owners for the follow-ups and the dependencies on other teams, plus the notes from the review meeting and the plan for next week.`,
).join(" ");
