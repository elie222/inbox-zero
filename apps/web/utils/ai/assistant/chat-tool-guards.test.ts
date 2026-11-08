import { asSchema, type ModelMessage, tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
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
  const tools = guardChatTools({
    archive: tool({
      description: "Archive threads",
      inputSchema: archiveInputSchema,
      execute,
    }),
  });
  return { tools, execute };
}

function runArchive(
  tools: ReturnType<typeof buildTools>["tools"],
  input: unknown,
  messages: ModelMessage[] = [{ role: "user", content: "archive these" }],
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
      { role: "user", content: "archive these" },
      toolCall("call-1", input),
      toolResult("call-1", { error: "Thread is locked" }),
    ]);

    expect(result).toMatchObject({
      error: expect.stringContaining("Thread is locked"),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "the earlier call succeeded",
      messages: [
        { role: "user", content: "archive these" },
        toolCall("call-1", { threadIds: ["t1"] }),
        toolResult("call-1", { success: true }),
      ],
    },
    {
      name: "the input changed",
      messages: [
        { role: "user", content: "archive these" },
        toolCall("call-1", { threadIds: ["t2"] }),
        toolResult("call-1", { error: "Thread is locked" }),
      ],
    },
    {
      name: "the failure was in an earlier turn",
      messages: [
        { role: "user", content: "archive these" },
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

function toolCall(toolCallId: string, input: unknown): ModelMessage {
  return {
    role: "assistant",
    content: [{ type: "tool-call", toolCallId, toolName: "archive", input }],
  };
}

function toolResult(
  toolCallId: string,
  value: Record<string, unknown>,
): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId,
        toolName: "archive",
        output: { type: "json", value: value as never },
      },
    ],
  };
}
