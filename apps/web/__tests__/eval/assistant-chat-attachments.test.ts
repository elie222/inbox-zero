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
  getFirstMatchingToolCall,
  getLastMatchingToolCall,
  summarizeRecordedToolCalls,
  type RecordedToolCall,
} from "@/__tests__/eval/assistant-chat-eval-utils";
import { getMockMessage } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai eval/assistant-chat-attachments
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/assistant-chat-attachments

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 120_000;
const evalReporter = createEvalReporter();
const logger = createScopedLogger("eval-assistant-chat-attachments");

const scenarios: EvalScenario[] = [
  {
    title:
      "searches inbox, reads email, activates attachments, then reads attachment for PDF content",
    reportName: "attachments: read PDF from Alice",
    prompt: "What does the PDF say in that email from Alice?",
    searchMessages: [
      getMockMessage({
        id: "msg-alice-pdf",
        threadId: "thread-alice-pdf",
        from: "alice@partner.example",
        subject: "Contract draft v2",
        snippet: "Please review the attached contract.",
        labelIds: ["UNREAD"],
        attachments: [
          {
            attachmentId: "att-pdf-1",
            filename: "contract-v2.pdf",
            mimeType: "application/pdf",
            size: 52_000,
            headers: {},
          },
        ],
      }),
    ],
    expectation: {
      kind: "read_attachment",
      searchExpectation:
        "A search query focused on finding an email from Alice, possibly about a PDF or attachment.",
      messageId: "msg-alice-pdf",
      attachmentId: "att-pdf-1",
    },
  },
  {
    title:
      "searches for invoice email, reads it, activates attachments, then reads attachment content",
    reportName: "attachments: read invoice attachment",
    prompt: "Read the attachment in the invoice email",
    searchMessages: [
      getMockMessage({
        id: "msg-invoice",
        threadId: "thread-invoice",
        from: "billing@vendor.example",
        subject: "Invoice #2026-0318",
        snippet: "Your monthly invoice is attached.",
        labelIds: [],
        attachments: [
          {
            attachmentId: "att-invoice-1",
            filename: "invoice-2026-0318.pdf",
            mimeType: "application/pdf",
            size: 34_000,
            headers: {},
          },
        ],
      }),
    ],
    expectation: {
      kind: "read_attachment",
      searchExpectation: "A search query focused on finding an invoice email.",
      messageId: "msg-invoice",
      attachmentId: "att-invoice-1",
    },
  },
  {
    title:
      "searches and reads email to check for attachments without needing readAttachment",
    reportName: "attachments: check if contract has attachments",
    prompt: "Does the contract email have any attachments?",
    searchMessages: [
      getMockMessage({
        id: "msg-contract",
        threadId: "thread-contract",
        from: "legal@company.example",
        subject: "Final contract for review",
        snippet: "Attached is the finalized contract.",
        labelIds: [],
        attachments: [
          {
            attachmentId: "att-contract-1",
            filename: "final-contract.pdf",
            mimeType: "application/pdf",
            size: 78_000,
            headers: {},
          },
        ],
      }),
    ],
    expectation: {
      kind: "check_attachments",
      searchExpectation:
        "A search query focused on finding the contract email.",
      messageId: "msg-contract",
    },
  },
];

const {
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockRedis,
  mockSearchMessages,
  mockGetMessage,
  mockGetAttachment,
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
  mockSearchMessages: vi.fn(),
  mockGetMessage: vi.fn(),
  mockGetAttachment: vi.fn(),
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

vi.mock("@/utils/prisma");

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

vi.mock("@/utils/drive/document-extraction", () => ({
  extractTextFromDocument: vi.fn().mockResolvedValue({
    text: "This is the extracted text from the PDF document.",
    truncated: false,
  }),
}));

describe.runIf(shouldRunEval)("Eval: assistant chat attachments", () => {
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

    mockGetAttachment.mockResolvedValue({
      data: "UERGIHR4dCBjb250ZW50",
      size: 100,
    });

    mockCreateEmailProvider.mockResolvedValue({
      searchMessages: mockSearchMessages,
      getLabels: vi.fn().mockResolvedValue(getDefaultLabels()),
      getMessage: mockGetMessage,
      getAttachment: mockGetAttachment,
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
    });
  });

  describeEvalMatrix("assistant-chat attachments", (model, emailAccount) => {
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

          const result = await runAssistantChat({
            emailAccount,
            messages: [{ role: "user", content: scenario.prompt }],
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
  });

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

type SearchInboxInput = {
  query: string;
};

type ReadEmailInput = {
  messageId: string;
};

type ActivateToolsInput = {
  capabilities: string[];
};

type ReadAttachmentInput = {
  messageId: string;
  attachmentId: string;
};

type ScenarioExpectation =
  | {
      kind: "read_attachment";
      searchExpectation: string;
      messageId: string;
      attachmentId: string;
    }
  | {
      kind: "check_attachments";
      searchExpectation: string;
      messageId: string;
    };

type EvalScenario = {
  title: string;
  reportName: string;
  prompt: string;
  searchMessages?: ReturnType<typeof getMockMessage>[];
  expectation: ScenarioExpectation;
};

function isSearchInboxInput(input: unknown): input is SearchInboxInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { query?: unknown }).query === "string"
  );
}

function isReadEmailInput(input: unknown): input is ReadEmailInput {
  return (
    !!input &&
    typeof input === "object" &&
    typeof (input as { messageId?: unknown }).messageId === "string"
  );
}

function isActivateToolsInput(input: unknown): input is ActivateToolsInput {
  if (!input || typeof input !== "object") return false;
  return Array.isArray((input as { capabilities?: unknown }).capabilities);
}

function isReadAttachmentInput(input: unknown): input is ReadAttachmentInput {
  if (!input || typeof input !== "object") return false;
  const value = input as { messageId?: unknown; attachmentId?: unknown };
  return (
    typeof value.messageId === "string" &&
    typeof value.attachmentId === "string"
  );
}

function hasToolBeforeTool(
  toolCalls: RecordedToolCall[],
  firstToolName: string,
  secondToolName: string,
) {
  const firstIndex = toolCalls.findIndex((tc) => tc.toolName === firstToolName);
  const secondIndex = toolCalls.findIndex(
    (tc) => tc.toolName === secondToolName,
  );
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

async function evaluateScenario(
  result: Awaited<ReturnType<typeof runAssistantChat>>,
  prompt: string,
  expectation: ScenarioExpectation,
) {
  const searchCall = getFirstMatchingToolCall(
    result.toolCalls,
    "searchInbox",
    isSearchInboxInput,
  )?.input;

  const searchJudge = searchCall
    ? await judgeEvalOutput({
        input: prompt,
        output: searchCall.query,
        expected: expectation.searchExpectation,
        criterion: {
          name: "Search query semantics",
          description:
            "The generated search query should semantically target the requested email even if the exact wording differs from the prompt.",
        },
      })
    : null;

  switch (expectation.kind) {
    case "read_attachment": {
      const readEmailCall = getLastMatchingToolCall(
        result.toolCalls,
        "readEmail",
        isReadEmailInput,
      )?.input;
      const readAttachmentCall = getLastMatchingToolCall(
        result.toolCalls,
        "readAttachment",
        isReadAttachmentInput,
      )?.input;

      const hasCorrectChain =
        !!searchCall &&
        !!readEmailCall &&
        !!readAttachmentCall &&
        hasToolBeforeTool(result.toolCalls, "searchInbox", "readEmail") &&
        hasToolBeforeTool(result.toolCalls, "readEmail", "readAttachment");

      const hasCorrectIds =
        readEmailCall?.messageId === expectation.messageId &&
        readAttachmentCall?.messageId === expectation.messageId &&
        readAttachmentCall?.attachmentId === expectation.attachmentId;

      return {
        pass: hasCorrectChain && hasCorrectIds && !!searchJudge?.pass,
        actual:
          searchCall && searchJudge
            ? `${result.actual} | ${formatSemanticJudgeActual(
                searchCall.query,
                searchJudge,
              )}`
            : result.actual,
      };
    }

    case "check_attachments": {
      const readEmailCall = getLastMatchingToolCall(
        result.toolCalls,
        "readEmail",
        isReadEmailInput,
      )?.input;

      const hasCorrectChain =
        !!searchCall &&
        !!readEmailCall &&
        hasToolBeforeTool(result.toolCalls, "searchInbox", "readEmail");

      const hasCorrectId = readEmailCall?.messageId === expectation.messageId;

      const didNotReadAttachment = !result.toolCalls.some(
        (tc) => tc.toolName === "readAttachment",
      );

      return {
        pass:
          hasCorrectChain &&
          hasCorrectId &&
          didNotReadAttachment &&
          !!searchJudge?.pass,
        actual:
          searchCall && searchJudge
            ? `${result.actual} | ${formatSemanticJudgeActual(
                searchCall.query,
                searchJudge,
              )}`
            : result.actual,
      };
    }
  }
}

function summarizeToolCall(toolCall: RecordedToolCall) {
  if (isSearchInboxInput(toolCall.input)) {
    return `${toolCall.toolName}(query=${toolCall.input.query})`;
  }

  if (toolCall.toolName === "readEmail" && isReadEmailInput(toolCall.input)) {
    return `readEmail(messageId=${toolCall.input.messageId})`;
  }

  if (
    toolCall.toolName === "activateTools" &&
    isActivateToolsInput(toolCall.input)
  ) {
    return `activateTools(${toolCall.input.capabilities.join(",")})`;
  }

  if (
    toolCall.toolName === "readAttachment" &&
    isReadAttachmentInput(toolCall.input)
  ) {
    return `readAttachment(messageId=${toolCall.input.messageId}, attachmentId=${toolCall.input.attachmentId})`;
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
  const messages = [
    getMockMessage({
      id: "msg-alice-pdf",
      threadId: "thread-alice-pdf",
      from: "alice@partner.example",
      subject: "Contract draft v2",
      snippet: "Please review the attached contract.",
      textPlain: "Hi, please review the attached contract draft. Thanks, Alice",
      labelIds: ["UNREAD"],
      attachments: [
        {
          attachmentId: "att-pdf-1",
          filename: "contract-v2.pdf",
          mimeType: "application/pdf",
          size: 52_000,
          headers: {},
        },
      ],
    }),
    getMockMessage({
      id: "msg-invoice",
      threadId: "thread-invoice",
      from: "billing@vendor.example",
      subject: "Invoice #2026-0318",
      snippet: "Your monthly invoice is attached.",
      textPlain: "Please find your monthly invoice attached.",
      labelIds: [],
      attachments: [
        {
          attachmentId: "att-invoice-1",
          filename: "invoice-2026-0318.pdf",
          mimeType: "application/pdf",
          size: 34_000,
          headers: {},
        },
      ],
    }),
    getMockMessage({
      id: "msg-contract",
      threadId: "thread-contract",
      from: "legal@company.example",
      subject: "Final contract for review",
      snippet: "Attached is the finalized contract.",
      textPlain: "Please review the finalized contract attached to this email.",
      labelIds: [],
      attachments: [
        {
          attachmentId: "att-contract-1",
          filename: "final-contract.pdf",
          mimeType: "application/pdf",
          size: 78_000,
          headers: {},
        },
      ],
    }),
  ];

  const message = messages.find((candidate) => candidate.id === messageId);
  if (!message) {
    throw new Error(`Unexpected messageId: ${messageId}`);
  }

  return message;
}
