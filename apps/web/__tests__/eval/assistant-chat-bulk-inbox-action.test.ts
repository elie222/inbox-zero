import { afterAll, describe, expect, test } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  formatSemanticJudgeActual,
  judgeEvalOutput,
} from "@/__tests__/eval/semantic-judge";
import { getMockMessage } from "@/__tests__/helpers";
import {
  cloneEmailAccountForProvider,
  inboxWorkflowProviders,
  mockSearchMessages,
  runAssistantChat,
  setupInboxWorkflowEval,
  shouldRunEval,
  TIMEOUT,
} from "@/__tests__/eval/assistant-chat-inbox-workflows-test-utils";
import type { RecordedToolCall } from "@/__tests__/eval/assistant-chat-eval-utils";

// pnpm --filter inbox-zero-ai test-ai eval/assistant-chat-bulk-inbox-action
// Multi-model: EVAL_MODELS=all pnpm --filter inbox-zero-ai test-ai eval/assistant-chat-bulk-inbox-action

const evalReporter = createEvalReporter({
  evalName: "assistant-chat-bulk-inbox-action",
});

const PAGE_SIZE = 20;
const TOTAL_PAGES = 15;

describe.runIf(shouldRunEval)("Eval: assistant chat bulk inbox action", () => {
  setupInboxWorkflowEval();

  describeEvalMatrix(
    "assistant-chat bulk inbox action",
    (model, emailAccount) => {
      test.each(inboxWorkflowProviders)(
        "uses bulkManageInbox for a cleanup spanning many pages [$label]",
        async ({ provider }) => {
          mockPagedMailbox({
            from: "deals@shop.example",
            subject: "Flash sale",
            snippet: "Up to 70% off this weekend only.",
          });

          const prompt =
            "Archive every promotional email from deals@shop.example in my inbox. There are hundreds of them.";
          const { toolCalls, finalText, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, provider),
            inboxStats: { total: 4200, unread: 1300 },
            messages: [{ role: "user", content: prompt }],
          });

          const bulkCalls = getToolCalls(toolCalls, "bulkManageInbox");
          const manageInboxCalls = getToolCalls(toolCalls, "manageInbox");
          const usedBulkTool =
            bulkCalls.length === 1 &&
            getInputField(bulkCalls[0].input, "action") === "archive_threads" &&
            // The search must stay on the sender the user named.
            JSON.stringify(bulkCalls[0].input)
              .toLowerCase()
              .includes("deals@shop.example") &&
            manageInboxCalls.length === 0;

          const judge = usedBulkTool
            ? await judgeEvalOutput({
                input: prompt,
                output: finalText,
                expected:
                  "The assistant says the archive is ready and waiting for the user to confirm it, without claiming any emails were already archived.",
                criterion: {
                  name: "Pending confirmation reported accurately",
                  description:
                    "The reply must not claim the cleanup already happened. It should make clear the user needs to confirm before anything changes.",
                },
              })
            : null;
          const pass = usedBulkTool && Boolean(judge?.pass);

          evalReporter.record({
            testName: `large cleanup uses bulk tool (${provider})`,
            model: model.label,
            pass,
            actual: judge
              ? `${actual} | ${formatSemanticJudgeActual(finalText, judge)}`
              : actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test(
        "passes the judgment the search cannot express as an instruction",
        async () => {
          mockPagedMailbox({
            from: "Tech Weekly <newsletter@techweekly.example>",
            subject: "This week in tech",
            snippet: "The top stories you missed this week.",
          });

          const prompt =
            "My inbox has thousands of emails. Archive all the newsletters, but keep any that are from people I actually correspond with or that mention an invoice.";
          const { toolCalls, finalText, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, "google"),
            inboxStats: { total: 5100, unread: 2200 },
            messages: [{ role: "user", content: prompt }],
          });

          const bulkCalls = getToolCalls(toolCalls, "bulkManageInbox");
          const bulkInput = bulkCalls[0]?.input;
          const usedBulkTool =
            bulkCalls.length === 1 &&
            getInputField(bulkInput, "action") === "archive_threads" &&
            getToolCalls(toolCalls, "manageInbox").length === 0;

          const judge = usedBulkTool
            ? await judgeEvalOutput({
                input: prompt,
                output: JSON.stringify(bulkInput),
                expected:
                  "A bulk archive whose search and instruction together target newsletters while keeping emails from real correspondents and anything about invoices.",
                criterion: {
                  name: "Bulk action scope matches the request",
                  description:
                    "The action only applies to search matches that also pass the instruction, which AI checks for every email. So a broad query is fine when the instruction carries the scope. Together the query and instruction must target newsletters and preserve the exceptions the user named; exceptions a search query cannot express must appear in the instruction.",
                },
              })
            : null;
          const pass = usedBulkTool && Boolean(judge?.pass);

          evalReporter.record({
            testName: "judged cleanup passes an instruction",
            model: model.label,
            pass,
            actual: judge
              ? `${actual} | ${formatSemanticJudgeActual(JSON.stringify(bulkInput), judge)}`
              : `${actual} | reply=${JSON.stringify(finalText)}`,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );

      test.each(inboxWorkflowProviders)(
        "uses manageInbox for a handful of emails [$label]",
        async ({ provider }) => {
          mockSearchMessages.mockResolvedValue({
            messages: Array.from({ length: 3 }, (_, index) =>
              getMockMessage({
                id: `msg-shipping-${index + 1}`,
                threadId: `thread-shipping-${index + 1}`,
                from: "Acme Shipping <shipping@acme.example>",
                subject: `Your order has shipped #${index + 1}`,
                snippet: "Your package is on its way.",
                labelIds: ["INBOX"],
              }),
            ),
            nextPageToken: undefined,
          });

          const { toolCalls, actual } = await runAssistantChat({
            emailAccount: cloneEmailAccountForProvider(emailAccount, provider),
            inboxStats: { total: 180, unread: 12 },
            messages: [
              {
                role: "user",
                content:
                  "Archive the shipping notification emails from Acme Shipping.",
              },
            ],
          });

          const archivedThreadIds = getToolCalls(toolCalls, "manageInbox")
            .filter(
              (call) =>
                getInputField(call.input, "action") === "archive_threads",
            )
            .flatMap((call) => {
              const threadIds = getInputField(call.input, "threadIds");
              return Array.isArray(threadIds) ? threadIds : [];
            });
          const pass =
            getToolCalls(toolCalls, "bulkManageInbox").length === 0 &&
            [...new Set(archivedThreadIds)].sort().join(",") ===
              "thread-shipping-1,thread-shipping-2,thread-shipping-3";

          evalReporter.record({
            testName: `handful uses manageInbox (${provider})`,
            model: model.label,
            pass,
            actual,
          });

          expect(pass).toBe(true);
        },
        TIMEOUT,
      );
    },
  );

  afterAll(() => {
    evalReporter.printReport();
  });
});

function mockPagedMailbox({
  from,
  subject,
  snippet,
}: {
  from: string;
  subject: string;
  snippet: string;
}) {
  mockSearchMessages.mockImplementation(
    async ({ query, pageToken }: { query?: string; pageToken?: string }) => {
      // Searches outside the bulk mail return what a real mailbox would, so
      // checking sent mail or invoices does not surface the same newsletters.
      const otherMail = getOtherMailForQuery(query ?? "");
      if (otherMail) return { messages: otherMail, nextPageToken: undefined };

      const page = pageToken ? Number(pageToken.replace("PAGE_", "")) : 1;
      return {
        messages: Array.from({ length: PAGE_SIZE }, (_, index) => {
          const number = (page - 1) * PAGE_SIZE + index + 1;
          return getMockMessage({
            id: `msg-${number}`,
            threadId: `thread-${number}`,
            from,
            subject: `${subject} ${number}`,
            snippet,
            labelIds: ["INBOX", "UNREAD"],
          });
        }),
        nextPageToken: page < TOTAL_PAGES ? `PAGE_${page + 1}` : undefined,
      };
    },
  );
}

function getOtherMailForQuery(query: string) {
  const normalized = query.toLowerCase();
  if (normalized.includes("in:sent")) {
    return CORRESPONDENTS.map((person, index) =>
      getMockMessage({
        id: `msg-sent-${index + 1}`,
        threadId: `thread-person-${index + 1}`,
        from: "user@test.com",
        to: person.email,
        subject: person.subject,
        snippet: "Thanks, sounds good. Talk soon.",
        labelIds: ["SENT"],
      }),
    );
  }
  if (normalized.includes("invoice")) {
    return [
      getMockMessage({
        id: "msg-invoice-1",
        threadId: "thread-invoice-1",
        from: "Billing <billing@vendor.example>",
        subject: "Invoice INV-2207 for October",
        snippet: "Your invoice for October is attached.",
        labelIds: ["INBOX"],
      }),
    ];
  }
  return null;
}

const CORRESPONDENTS = [
  { email: "dana@partner.example", subject: "Re: Contract redlines" },
  { email: "sam@client.example", subject: "Re: Call on Thursday" },
];

function getToolCalls(toolCalls: RecordedToolCall[], toolName: string) {
  return toolCalls.filter((toolCall) => toolCall.toolName === toolName);
}

function getInputField(input: unknown, field: string) {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)[field]
    : undefined;
}
