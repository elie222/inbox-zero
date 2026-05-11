import type { ModelMessage } from "ai";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
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
  captureAssistantChatToolCalls,
  getLastMatchingToolCall,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import { getMockMessage } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai eval/assistant-chat-trash-delete
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-trash-delete

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-trash-delete");

const spamMessages = [
  getMockMessage({
    id: "msg-spam-1",
    threadId: "thread-spam-1",
    from: "offers@spam.test",
    subject: "You won a free iPhone!",
    snippet: "Click here to claim your prize now!",
    labelIds: ["INBOX", "UNREAD"],
  }),
  getMockMessage({
    id: "msg-spam-2",
    threadId: "thread-spam-2",
    from: "deals@spam.test",
    subject: "Limited time offer - 90% off",
    snippet: "Buy now before it's too late!",
    labelIds: ["INBOX", "UNREAD"],
  }),
];

const marketingMessages = [
  getMockMessage({
    id: "msg-marketing-1",
    threadId: "thread-marketing-1",
    from: "marketing@spam.test",
    subject: "Special promotion just for you",
    snippet: "Check out our latest deals and offers",
    labelIds: ["INBOX", "UNREAD"],
  }),
];

const newsletterMessages = [
  getMockMessage({
    id: "msg-newsletter-1",
    threadId: "thread-newsletter-1",
    from: "weekly@newsletter.test",
    subject: "Weekly Tech Digest #42",
    snippet: "Top stories from this week in tech",
    labelIds: ["INBOX", "UNREAD"],
  }),
  getMockMessage({
    id: "msg-newsletter-2",
    threadId: "thread-newsletter-2",
    from: "daily@newsletter.test",
    subject: "Your Daily Brief",
    snippet: "Here's what happened today",
    labelIds: ["INBOX", "UNREAD"],
  }),
];

const scenarios: EvalScenario[] = [
  {
    title: "uses trash_threads for explicit delete request on spam",
    reportName: "delete spam uses trash_threads",
    prompt: "Delete those spam emails",
    prefillSearch: spamMessages,
    searchMessages: spamMessages,
    expectation: {
      kind: "trash_threads",
      threadIds: ["thread-spam-1", "thread-spam-2"],
    },
  },
  {
    title: "uses trash_threads when user says trash explicitly",
    reportName: "explicit trash uses trash_threads",
    prompt: "Trash the emails from marketing@spam.test",
    searchMessages: marketingMessages,
    expectation: {
      kind: "trash_threads",
      threadIds: ["thread-marketing-1"],
    },
  },
  {
    title: "prefers archive over trash for ambiguous cleanup",
    reportName: "clean up prefers archive",
    prompt: "Clean up my inbox",
    searchMessages: [...newsletterMessages, ...spamMessages],
    expectation: {
      kind: "no_trash",
    },
  },
  {
    title: "uses archive_threads for explicit archive request",
    reportName: "archive newsletters uses archive_threads",
    prompt: "Archive the newsletters",
    searchMessages: newsletterMessages,
    expectation: {
      kind: "archive_threads",
      threadIds: ["thread-newsletter-1", "thread-newsletter-2"],
    },
  },
  {
    title: "uses trash_threads when user wants permanent removal",
    reportName: "permanent removal uses trash_threads",
    prompt: "Remove those completely, I don't want them in archive either",
    prefillSearch: spamMessages,
    searchMessages: spamMessages,
    expectation: {
      kind: "trash_threads",
      threadIds: ["thread-spam-1", "thread-spam-2"],
    },
  },
  {
    title: "ambiguous get rid of defaults to archive or asks clarification",
    reportName: "get rid of prefers archive or clarification",
    prompt: "Get rid of these",
    prefillSearch: newsletterMessages,
    searchMessages: newsletterMessages,
    expectation: {
      kind: "no_trash",
    },
  },
];

const {
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockUnsubscribeSenderAndMark,
  mockSearchMessages,
  mockGetMessage,
  mockTrashThread,
  mockArchiveThreadWithLabel,
} = vi.hoisted(() => ({
  mockCreateEmailProvider: vi.fn(),
  mockPosthogCaptureEvent: vi.fn(),
  mockRedis: {
    set: vi.fn(),
    rpush: vi.fn(),
    hincrby: vi.fn(),
    expire: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    llen: vi.fn().mockResolvedValue(0),
    lrange: vi.fn().mockResolvedValue([]),
  },
  mockUnsubscribeSenderAndMark: vi.fn(),
  mockSearchMessages: vi.fn(),
  mockGetMessage: vi.fn(),
  mockTrashThread: vi.fn(),
  mockArchiveThreadWithLabel: vi.fn(),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mockCreateEmailProvider,
}));

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: mockPosthogCaptureEvent,
  getPosthogLlmClient: () => null,
}));

vi.mock("@/utils/redis", () => ({
  redis: mockRedis,
}));

vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: mockUnsubscribeSenderAndMark,
}));

vi.mock("@/utils/prisma");

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

describe.runIf(shouldRunEval)("Eval: assistant chat trash/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockImplementation(async ({ select }) => {
      if (select?.email) {
        return {
          email: "user@test.com",
          timezone: "America/Los_Angeles",
          meetingBriefingsEnabled: false,
          meetingBriefingsMinutesBefore: 15,
          meetingBriefsSendEmail: false,
          filingEnabled: false,
          filingPrompt: null,
          filingFolders: [],
          driveConnections: [],
        };
      }

      return {
        about: "Keep replies concise and direct.",
        rules: [],
      };
    });

    mockSearchMessages.mockResolvedValue({
      messages: getDefaultSearchMessages(),
      nextPageToken: undefined,
    });

    mockGetMessage.mockImplementation(async (messageId: string) =>
      getMessageById(messageId),
    );

    mockTrashThread.mockResolvedValue(undefined);
    mockArchiveThreadWithLabel.mockResolvedValue(undefined);

    mockCreateEmailProvider.mockResolvedValue({
      searchMessages: mockSearchMessages,
      getLabels: vi.fn().mockResolvedValue(getDefaultLabels()),
      getMessage: mockGetMessage,
      trashThread: mockTrashThread,
      archiveThreadWithLabel: mockArchiveThreadWithLabel,
      markReadThread: vi.fn().mockResolvedValue(undefined),
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
    });
  });

  describeEvalMatrix(
    "assistant-chat trash/delete actions",
    (model, emailAccount) => {
      for (const scenario of scenarios) {
        test(
          scenario.title,
          async () => {
            if (scenario.searchMessages) {
              mockSearchMessages.mockResolvedValueOnce({
                messages: scenario.searchMessages,
                nextPageToken: undefined,
              });
            }

            const messages: ModelMessage[] = [];

            if (scenario.prefillSearch) {
              messages.push(
                { role: "user", content: "Show me my recent emails" },
                {
                  role: "assistant",
                  content: `I found ${scenario.prefillSearch.length} emails:\n${scenario.prefillSearch.map((m, i) => `${i + 1}. From ${m.headers.from}: "${m.subject}" (thread: ${m.threadId})`).join("\n")}`,
                },
              );
            }

            messages.push({ role: "user", content: scenario.prompt });

            const result = await runAssistantChat({
              emailAccount,
              messages,
            });

            const evaluation = await evaluateScenario(
              result,
              scenario.prompt,
              scenario.expectation,
            );

            evalReporter.record({
              testName: scenario.reportName,
              model: model.label,
              pass: evaluation.pass,
              actual: evaluation.actual,
            });

            expect(evaluation.pass).toBe(true);
          },
          TIMEOUT,
        );
      }
    },
  );

  afterAll(() => {
    evalReporter.printReport();
  });
});

async function runAssistantChat({
  emailAccount,
  messages,
}: {
  emailAccount: ReturnType<typeof getEmailAccount>;
  messages: ModelMessage[];
}) {
  const toolCalls = await captureAssistantChatToolCalls({
    messages,
    emailAccount,
    logger,
  });

  return {
    toolCalls,
    actual: summarizeRecordedToolCalls(toolCalls, summarizeToolCall),
  };
}

type ManageInboxInput = {
  action: string;
  threadIds?: string[];
  fromEmails?: string[];
  label?: string;
  labelName?: string;
  read?: boolean;
};

type ScenarioExpectation =
  | {
      kind: "trash_threads";
      threadIds: string[];
    }
  | {
      kind: "archive_threads";
      threadIds: string[];
    }
  | {
      kind: "no_trash";
    };

type EvalScenario = {
  title: string;
  reportName: string;
  prompt: string;
  prefillSearch?: ReturnType<typeof getMockMessage>[];
  searchMessages?: ReturnType<typeof getMockMessage>[];
  expectation: ScenarioExpectation;
};

function isManageInboxInput(input: unknown): input is ManageInboxInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { action?: unknown }).action === "string"
  );
}

async function evaluateScenario(
  result: Awaited<ReturnType<typeof runAssistantChat>>,
  prompt: string,
  expectation: ScenarioExpectation,
) {
  switch (expectation.kind) {
    case "trash_threads": {
      const manageCall = getLastMatchingToolCall(
        result.toolCalls,
        "manageInbox",
        isManageInboxInput,
      )?.input;

      const isTrash = manageCall?.action === "trash_threads";
      const hasExpectedThreads = isTrash
        ? expectation.threadIds.every((id) =>
            manageCall.threadIds?.includes(id),
          )
        : false;
      const hasExactCount =
        isTrash &&
        manageCall.threadIds?.length === expectation.threadIds.length;

      return {
        pass: isTrash && hasExpectedThreads && hasExactCount,
        actual: manageCall
          ? `manageInbox(action=${manageCall.action}, threadIds=${JSON.stringify(manageCall.threadIds)})`
          : result.actual,
      };
    }

    case "archive_threads": {
      const manageCall = getLastMatchingToolCall(
        result.toolCalls,
        "manageInbox",
        isManageInboxInput,
      )?.input;

      const isArchive = manageCall?.action === "archive_threads";
      const hasExpectedThreads = isArchive
        ? expectation.threadIds.every((id) =>
            manageCall.threadIds?.includes(id),
          )
        : false;
      const hasExactCount =
        isArchive &&
        manageCall.threadIds?.length === expectation.threadIds.length;
      const notTrash = !result.toolCalls.some(
        (tc) =>
          tc.toolName === "manageInbox" &&
          isManageInboxInput(tc.input) &&
          tc.input.action === "trash_threads",
      );

      return {
        pass: isArchive && hasExpectedThreads && hasExactCount && notTrash,
        actual: manageCall
          ? `manageInbox(action=${manageCall.action}, threadIds=${JSON.stringify(manageCall.threadIds)})`
          : result.actual,
      };
    }

    case "no_trash": {
      const hasTrashCall = result.toolCalls.some(
        (tc) =>
          tc.toolName === "manageInbox" &&
          isManageInboxInput(tc.input) &&
          tc.input.action === "trash_threads",
      );

      const semanticJudge = await judgeEvalOutput({
        input: prompt,
        output: result.actual,
        expected:
          "The AI should either use archive_threads, ask for clarification, or recommend archiving. It should NOT use trash_threads.",
        criterion: {
          name: "Trash avoidance for ambiguous requests",
          description:
            "For ambiguous cleanup requests, the AI should default to archiving or ask for clarification rather than trashing/deleting.",
        },
      });

      return {
        pass: !hasTrashCall && !!semanticJudge?.pass,
        actual: hasTrashCall
          ? `used trash_threads (should not have) | ${result.actual}`
          : `${result.actual} | ${formatSemanticJudgeActual(result.actual, semanticJudge)}`,
      };
    }
  }
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (isManageInboxInput(toolCall.input)) {
    const threads = toolCall.input.threadIds
      ? `threadIds=${JSON.stringify(toolCall.input.threadIds)}`
      : "";
    const senders = toolCall.input.fromEmails
      ? `fromEmails=${JSON.stringify(toolCall.input.fromEmails)}`
      : "";
    const detail = [threads, senders].filter(Boolean).join(", ");
    return `${toolCall.toolName}(action=${toolCall.input.action}${detail ? `, ${detail}` : ""})`;
  }

  if (
    toolCall.input &&
    typeof toolCall.input === "object" &&
    "query" in toolCall.input
  ) {
    return `${toolCall.toolName}(query=${(toolCall.input as { query: string }).query})`;
  }

  return toolCall.toolName;
}

function getDefaultLabels() {
  return [
    { id: "INBOX", name: "INBOX" },
    { id: "UNREAD", name: "UNREAD" },
    { id: "Label_To Reply", name: "To Reply" },
  ];
}

function getDefaultSearchMessages() {
  return [
    getMockMessage({
      id: "msg-default-1",
      threadId: "thread-default-1",
      from: "updates@product.example",
      subject: "Weekly summary",
      snippet: "A quick summary of this week's updates.",
      labelIds: ["UNREAD"],
    }),
  ];
}

function getMessageById(messageId: string) {
  const allMessages = [
    ...spamMessages,
    ...marketingMessages,
    ...newsletterMessages,
    getMockMessage({
      id: "msg-default-1",
      threadId: "thread-default-1",
      from: "updates@product.example",
      subject: "Weekly summary",
      snippet: "A quick summary of this week's updates.",
      textPlain: "A quick summary of this week's updates.",
      labelIds: ["UNREAD"],
    }),
  ];

  const message = allMessages.find((candidate) => candidate.id === messageId);
  if (!message) {
    throw new Error(`Unexpected messageId: ${messageId}`);
  }

  return message;
}
