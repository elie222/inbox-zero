import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  RECENT_TOOL_RESULTS_TO_KEEP,
  trimStaleToolResults,
} from "@/utils/ai/assistant/trim-stale-tool-results";

describe("trimStaleToolResults", () => {
  it("leaves conversations under the budget untouched", () => {
    const messages = [
      userMessage("Clean up my inbox"),
      ...searchRound(0, { snippetLength: 100 }),
    ];

    expect(trimStaleToolResults(messages)).toBe(messages);
  });

  it("keeps identifiers from stale search results and drops bulky fields", () => {
    const messages = buildLargeTurn();

    const trimmed = trimStaleToolResults(messages);

    const firstSearch = getToolOutputValue(trimmed, "call-0");
    expect(firstSearch).toMatchObject({
      queryUsed: "query 0",
      nextPageToken: "page-token-0",
      messages: [
        {
          messageId: "message-0",
          threadId: "thread-0",
          subject: "Subject 0",
          from: "sender-0@example.com",
        },
      ],
    });
    expect(JSON.stringify(firstSearch)).not.toContain("snippet-0");
    expect(JSON.stringify(firstSearch)).not.toContain("https://");
  });

  it("keeps the most recent tool results intact", () => {
    const messages = buildLargeTurn();
    const lastCallId = `call-${TURN_ROUNDS - 1}`;

    const trimmed = trimStaleToolResults(messages);

    expect(getToolOutputValue(trimmed, lastCallId)).toEqual(
      getToolOutputValue(messages, lastCallId),
    );
  });

  it("shortens stale email content but keeps attachment identifiers", () => {
    const messages = [
      userMessage("What did the contract say?"),
      ...readEmailRound("read-0", "c".repeat(4000)),
      ...buildLargeTurn(),
    ];

    const trimmed = trimStaleToolResults(messages);
    const readResult = getToolOutputValue(trimmed, "read-0") as {
      content: string;
      attachments: Array<{ attachmentId: string }>;
    };

    expect(readResult.content.length).toBeLessThan(1000);
    expect(readResult.attachments).toEqual([
      { attachmentId: "attachment-1", filename: "contract.pdf" },
    ]);
  });

  it("does not trim again until enough new results accumulate", () => {
    const largeConversationHistory = userMessage("h".repeat(600_000));
    const once = trimStaleToolResults([
      largeConversationHistory,
      ...buildLargeTurn(),
    ]);
    const withNewResults = [
      ...once,
      ...searchRound(TURN_ROUNDS, { snippetLength: 3000 }),
      ...searchRound(TURN_ROUNDS + 1, { snippetLength: 3000 }),
    ];

    expect(trimStaleToolResults(withNewResults)).toBe(withNewResults);
  });

  it("leaves small stale results unchanged", () => {
    const messages = [
      userMessage("Clean up my inbox"),
      ...moveRound("move-0"),
      ...buildLargeTurn(),
    ];

    const trimmed = trimStaleToolResults(messages);

    expect(getToolOutputValue(trimmed, "move-0")).toEqual({
      success: true,
      movedCount: 1,
    });
  });
});

const TURN_ROUNDS = RECENT_TOOL_RESULTS_TO_KEEP + 150;

function buildLargeTurn(): ModelMessage[] {
  return [
    userMessage("Move every newsletter into the Newsletters folder"),
    ...Array.from({ length: TURN_ROUNDS }, (_, index) =>
      searchRound(index, { snippetLength: 3000 }),
    ).flat(),
  ];
}

function userMessage(content: string): ModelMessage {
  return { role: "user", content };
}

function searchRound(
  index: number,
  { snippetLength }: { snippetLength: number },
): ModelMessage[] {
  const callId = `call-${index}`;
  return [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: callId,
          toolName: "searchInbox",
          input: { query: `query ${index}` },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: callId,
          toolName: "searchInbox",
          output: {
            type: "json",
            value: {
              queryUsed: `query ${index}`,
              totalReturned: 1,
              nextPageToken: `page-token-${index}`,
              hasMore: true,
              summary: { total: 1 },
              messages: [
                {
                  messageId: `message-${index}`,
                  threadId: `thread-${index}`,
                  externalUrl: `https://mail.example.com/${index}`,
                  subject: `Subject ${index}`,
                  from: `sender-${index}@example.com`,
                  to: "user@example.com",
                  snippet: `snippet-${index} ${"s".repeat(snippetLength)}`,
                  date: "2026-09-25T10:00:00.000Z",
                  labelNames: ["Newsletter"],
                  category: "fyi",
                  isUnread: true,
                  hasAttachments: false,
                },
              ],
            },
          },
        },
      ],
    },
  ];
}

function moveRound(callId: string): ModelMessage[] {
  return [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: callId,
          toolName: "moveThreadsToFolder",
          input: { threadIds: ["thread-0"], folderName: "Projects" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: callId,
          toolName: "moveThreadsToFolder",
          output: { type: "json", value: { success: true, movedCount: 1 } },
        },
      ],
    },
  ];
}

function readEmailRound(callId: string, content: string): ModelMessage[] {
  return [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: callId,
          toolName: "readEmail",
          input: { messageId: "message-read" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: callId,
          toolName: "readEmail",
          output: {
            type: "json",
            value: {
              messageId: "message-read",
              threadId: "thread-read",
              externalUrl: "https://mail.example.com/read",
              from: "legal@example.com",
              to: "user@example.com",
              subject: "Contract",
              content,
              date: "2026-09-25T10:00:00.000Z",
              attachments: [
                { attachmentId: "attachment-1", filename: "contract.pdf" },
              ],
            },
          },
        },
      ],
    },
  ];
}

function getToolOutputValue(messages: ModelMessage[], toolCallId: string) {
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type === "tool-result" && part.toolCallId === toolCallId) {
        return "value" in part.output ? part.output.value : undefined;
      }
    }
  }
}
