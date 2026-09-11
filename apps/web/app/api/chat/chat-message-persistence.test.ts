import { describe, expect, it } from "vitest";
import {
  buildUserChatMessageMetadata,
  mapUiMessagesToChatMessageRows,
} from "./chat-message-persistence";

describe("mapUiMessagesToChatMessageRows", () => {
  it("preserves message IDs when mapping rows", () => {
    const rows = mapUiMessagesToChatMessageRows(
      [
        {
          id: "assistant-message-1",
          role: "assistant",
          parts: [{ type: "text", text: "Prepared a reply." }],
        } as any,
      ],
      "chat-1",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "assistant-message-1",
      chatId: "chat-1",
      role: "assistant",
    });
    expect(rows[0].parts).toEqual([
      { type: "text", text: "Prepared a reply." },
    ]);
  });

  it("omits empty message IDs so the database can generate one", () => {
    const rows = mapUiMessagesToChatMessageRows(
      [
        {
          id: "   ",
          role: "assistant",
          parts: [{ type: "text", text: "Done." }],
        } as any,
      ],
      "chat-1",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chatId: "chat-1",
      role: "assistant",
      parts: [{ type: "text", text: "Done." }],
    });
    expect(rows[0]).not.toHaveProperty("id");
  });

  it("stores compact hidden-context references without email content", () => {
    const metadata = buildUserChatMessageMetadata({
      runId: "run-1",
      context: {
        type: "fix-rule",
        message: {
          id: "provider-message-1",
          threadId: "provider-thread-1",
          snippet: "Private snippet that must not be persisted in metadata",
          textPlain: "Private email body that must not be persisted",
        },
        results: [{ ruleName: "Newsletters" }, { ruleName: null }],
      } as any,
      inlineActions: [
        { type: "archive_threads", threadIds: ["thread-1", "thread-2"] },
        { type: "mark_read_threads", threadIds: ["thread-3"] },
      ],
    });

    expect(metadata).toEqual({
      schemaVersion: 1,
      runId: "run-1",
      hiddenContext: {
        type: "fix-rule",
        messageId: "provider-message-1",
        threadId: "provider-thread-1",
        resultCount: 2,
      },
      inlineActions: {
        types: ["archive_threads", "mark_read_threads"],
        actionCount: 2,
        threadCount: 3,
      },
    });
    expect(JSON.stringify(metadata)).not.toContain("Private");
  });

  it("adds correlated run metadata to assistant rows", () => {
    const rows = mapUiMessagesToChatMessageRows(
      [
        {
          id: "assistant-message-1",
          role: "assistant",
          parts: [{ type: "text", text: "Done." }],
        } as any,
      ],
      "chat-1",
      {
        assistantRun: {
          runId: "run-1",
          provider: "openrouter",
          modelName: "test-model",
          pipelineVersion: 1,
          deploymentCommit: "commit-123",
          finishReason: "stop",
          stepCount: 2,
          toolCallCount: 3,
          visibleTextProduced: true,
        },
      },
    );

    expect(rows[0]?.metadata).toEqual({
      schemaVersion: 1,
      runId: "run-1",
      assistantRun: {
        provider: "openrouter",
        modelName: "test-model",
        pipelineVersion: 1,
        deploymentCommit: "commit-123",
        finishReason: "stop",
        stepCount: 2,
        toolCallCount: 3,
        visibleTextProduced: true,
      },
    });
  });
});
