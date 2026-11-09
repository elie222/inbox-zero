import { asSchema, type ModelMessage, tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTestLogger } from "@/__tests__/helpers";
import { guardChatTools } from "@/utils/ai/assistant/chat-tool-guards";

const archiveInputSchema = z.strictObject({
  threadIds: z.array(z.string()).min(1),
  label: z.string().trim().optional(),
});

function buildTools() {
  const execute = vi.fn(async (input: z.infer<typeof archiveInputSchema>) => ({
    success: true,
    archived: input.threadIds.length,
  }));
  const tools = guardChatTools(
    {
      archive: tool({
        description: "Archive threads",
        inputSchema: archiveInputSchema,
        execute,
      }),
    },
    createTestLogger(),
  );
  return { tools, execute };
}

function runArchive(
  tools: ReturnType<typeof buildTools>["tools"],
  input: unknown,
  messages: ModelMessage[] = [{ role: "user", content: "archive t1" }],
) {
  return tools.archive.execute!(input as never, {
    toolCallId: "call-new",
    messages,
    context: undefined as never,
  });
}

describe("guardChatTools", () => {
  it("keeps the JSON schema the model sees", async () => {
    const { tools } = buildTools();

    expect(await asSchema(tools.archive.inputSchema).jsonSchema).toEqual(
      await asSchema(archiveInputSchema).jsonSchema,
    );
  });

  it("hands the SDK the parsed input when it is valid", async () => {
    const { tools } = buildTools();
    const schema = asSchema(tools.archive.inputSchema);

    // The SDK stores this value as the tool call's input, and later flows
    // (such as rule confirmation) replay it, so it must be sanitized.
    expect(
      await schema.validate?.({ threadIds: ["t1"], label: "  Done " }),
    ).toEqual({ success: true, value: { threadIds: ["t1"], label: "Done" } });
  });

  it("lets invalid input reach execute so the model gets a readable error", async () => {
    const { tools, execute } = buildTools();
    const schema = asSchema(tools.archive.inputSchema);
    const input = { threadIds: [], folder: "x" };

    const sdkValidation = await schema.validate?.(input);
    expect(sdkValidation).toMatchObject({ success: true });

    const result = await runArchive(
      tools,
      sdkValidation?.success ? sdkValidation.value : input,
    );

    expect(result).toMatchObject({
      error: expect.stringMatching(
        /^Invalid archive input: .*threadIds.*unsupported field "folder"/,
      ),
      toolErrorVisibility: "hidden",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes parsed input to the tool", async () => {
    const { tools, execute } = buildTools();

    const result = await runArchive(tools, { threadIds: ["t1"] });

    expect(result).toEqual({ success: true, archived: 1 });
    expect(execute).toHaveBeenCalledWith(
      { threadIds: ["t1"] },
      expect.anything(),
    );
  });

  it("does not re-run a call that already failed in this response", async () => {
    const { tools, execute } = buildTools();
    const input = { threadIds: ["t1"] };

    const result = await runArchive(tools, input, [
      { role: "user", content: "archive t1" },
      toolCall("call-1", input),
      toolResult("call-1", { error: "Thread is locked" }),
    ]);

    expect(result).toMatchObject({
      error: expect.stringContaining("Thread is locked"),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not count another tool's retryable failure as recovery", async () => {
    const { tools, execute } = buildTools();
    const input = { threadIds: ["t1"] };

    await runArchive(tools, input, [
      { role: "user", content: "archive t1" },
      toolCall("call-1", input),
      toolResult("call-1", { error: "Thread is locked" }),
      otherToolCall("call-2"),
      toolResult(
        "call-2",
        {
          error: "Failed to search inbox",
          searchFeedback: { retryable: true },
        },
        "getRules",
      ),
    ]);

    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks a second identical failure even after a recovery step", async () => {
    const { tools, execute } = buildTools();
    const input = { threadIds: ["t1"] };

    const result = await runArchive(tools, input, [
      { role: "user", content: "archive t1" },
      toolCall("call-1", input),
      toolResult("call-1", { error: "Rule state is stale" }),
      otherToolCall("call-2"),
      toolResult("call-2", { rules: [] }, "getRules"),
      toolCall("call-3", input),
      toolResult("call-3", { error: "Rule state is stale" }),
      otherToolCall("call-4"),
      toolResult("call-4", { rules: [] }, "getRules"),
    ]);

    expect(result).toMatchObject({
      error: expect.stringContaining("already failed"),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "the earlier call succeeded",
      messages: [
        { role: "user", content: "archive t1" },
        toolCall("call-1", { threadIds: ["t1"] }),
        toolResult("call-1", { success: true }),
      ],
    },
    {
      name: "the input changed",
      messages: [
        { role: "user", content: "archive t1 or t2" },
        toolCall("call-1", { threadIds: ["t2"] }),
        toolResult("call-1", { error: "Thread is locked" }),
      ],
    },
    {
      name: "the earlier failure was marked retryable",
      messages: [
        { role: "user", content: "archive t1" },
        toolCall("call-1", { threadIds: ["t1"] }),
        toolResult("call-1", {
          error: "Failed to search inbox",
          searchFeedback: { retryable: true },
        }),
      ],
    },
    {
      name: "another tool call succeeded after the failure",
      messages: [
        { role: "user", content: "archive t1" },
        toolCall("call-1", { threadIds: ["t1"] }),
        toolResult("call-1", { error: "Rule state is stale" }),
        otherToolCall("call-2"),
        toolResult("call-2", { rules: [] }, "getRules"),
      ],
    },
    {
      name: "the failure was in an earlier turn",
      messages: [
        { role: "user", content: "archive t1" },
        toolCall("call-1", { threadIds: ["t1"] }),
        toolResult("call-1", { error: "Thread is locked" }),
        { role: "user", content: "I unlocked it, try again" },
      ],
    },
  ] satisfies Array<{
    name: string;
    messages: ModelMessage[];
  }>)("runs the call when $name", async ({ messages }) => {
    const { tools, execute } = buildTools();

    await runArchive(tools, { threadIds: ["t1"] }, messages);

    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("guardChatTools email ID checks", () => {
  const searchResult = toolResult("call-search", {
    messages: [
      { threadId: "AAMkThread-1==", messageId: "AAMkMessage-1==" },
      { threadId: "thread-2", messageId: "message-2" },
    ],
  });

  it("runs the tool with IDs copied from an earlier tool result", async () => {
    const { tools, execute } = buildTools();

    await runArchive(tools, { threadIds: ["AAMkThread-1==", "thread-2"] }, [
      { role: "user", content: "archive these" },
      searchResult,
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects an ID that never appeared, without echoing it back", async () => {
    const { tools, execute } = buildTools();

    const result = await runArchive(
      tools,
      { threadIds: ["thread-2", "AAMkThread-1="] },
      [{ role: "user", content: "archive these" }, searchResult],
    );

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: expect.stringContaining("threadIds[1]"),
    });
    expect(JSON.stringify(result)).not.toContain("AAMkThread-1=");
  });

  it.each([
    {
      name: "hidden email context",
      content:
        "The user is viewing this email.\nMessage ID: msg-ctx\nThread ID: thread-ctx\n<email>...</email>",
    },
    {
      name: "inline action note",
      content: "- Archived threads (2): thread-other, thread-ctx",
    },
  ])("accepts IDs given in a user message ($name)", async ({ content }) => {
    const { tools, execute } = buildTools();

    await runArchive(tools, { threadIds: ["thread-ctx"] }, [
      { role: "user", content },
      { role: "user", content: "archive it" },
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("accepts IDs from a hidden system note, like inline UI actions", async () => {
    const { tools, execute } = buildTools();

    await runArchive(tools, { threadIds: ["thread-ui"] }, [
      { role: "user", content: "archive it" },
      { role: "system", content: "- Marked read threads (1): thread-ui" },
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not trust ID-shaped text inside a result's free-text fields", async () => {
    const { tools, execute } = buildTools();

    const result = await runArchive(tools, { threadIds: ["thread-in-body"] }, [
      { role: "user", content: "archive it" },
      toolResult("call-read", {
        messageId: "message-2",
        threadId: "thread-2",
        content: "Please see thread-in-body for details.",
      }),
    ]);

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: expect.stringContaining("threadIds[0]"),
    });
  });

  it("skips the ID check for tools the caller exempts", async () => {
    const execute = vi.fn(
      async (input: z.infer<typeof archiveInputSchema>) => ({
        success: true,
        archived: input.threadIds.length,
      }),
    );
    const tools = guardChatTools(
      {
        archive: tool({
          description: "Archive threads",
          inputSchema: archiveInputSchema,
          execute,
        }),
      },
      createTestLogger(),
      { skipEmailIdCheck: ["archive"] },
    );

    await runArchive(tools, { threadIds: ["never-seen"] });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects a message ID passed as a thread ID", async () => {
    const { tools, execute } = buildTools();

    const result = await runArchive(tools, { threadIds: ["message-2"] }, [
      { role: "user", content: "archive it" },
      searchResult,
    ]);

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: expect.stringContaining("threadIds[0] is a messageId"),
    });
  });

  it("accepts an ID that is both a thread and message ID, as Gmail's first message is", async () => {
    const { tools, execute } = buildTools();

    await runArchive(tools, { threadIds: ["thread-3"] }, [
      { role: "user", content: "archive it" },
      toolResult("call-search", {
        messages: [{ threadId: "thread-3", messageId: "thread-3" }],
      }),
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not trust IDs that only appeared in a failed result", async () => {
    const { tools, execute } = buildTools();

    const result = await runArchive(tools, { threadIds: ["thread-typo"] }, [
      { role: "user", content: "archive these" },
      toolResult("call-1", {
        success: false,
        failedThreadIds: ["thread-typo"],
      }),
    ]);

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: expect.stringContaining("threadIds[0]"),
    });
  });
});

function toolCall(toolCallId: string, input: unknown): ModelMessage {
  return {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId, toolName: "archive", input }],
  };
}

function otherToolCall(toolCallId: string): ModelMessage {
  return {
    role: "assistant",
    content: [
      { type: "tool-call", toolCallId, toolName: "getRules", input: {} },
    ],
  };
}

function toolResult(
  toolCallId: string,
  value: Record<string, unknown>,
  toolName = "archive",
): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId,
        toolName,
        output: { type: "json", value: value as never },
      },
    ],
  };
}
