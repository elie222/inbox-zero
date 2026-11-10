import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, isStepCount, type ModelMessage, tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { setAnthropicCacheBreakpoints } from "@/utils/ai/assistant/cache-breakpoints";

const HISTORY: ModelMessage[] = [
  { role: "system", content: "system prompt" },
  { role: "user", content: "earlier question" },
  { role: "assistant", content: "earlier answer" },
  { role: "user", content: "clean up my inbox" },
];
const HISTORY_END_INDEX = 2;
// History ends with an assistant reply, so its breakpoint lands on the user
// message before it.
const HISTORY_BREAKPOINT_INDEX = 1;

describe("setAnthropicCacheBreakpoints", () => {
  it("marks the system prompt, the end of history, and the newest message", () => {
    const messages = setAnthropicCacheBreakpoints(HISTORY, HISTORY_END_INDEX);

    expect(messages.map(hasBreakpoint)).toEqual([true, true, false, true]);
  });

  it("moves the newest breakpoint forward as steps carry messages over", () => {
    let messages = setAnthropicCacheBreakpoints(HISTORY, HISTORY_END_INDEX);

    for (let step = 0; step < 3; step++) {
      messages = setAnthropicCacheBreakpoints(
        [...messages, ...toolStep(`call-${step}`)],
        HISTORY_END_INDEX,
      );
    }

    expect(countBreakpoints(messages)).toBe(3);
    expect(countBreakpoints(messages.slice(-1))).toBe(1);
    expect(hasBreakpoint(messages[HISTORY_BREAKPOINT_INDEX])).toBe(true);
  });

  it("marks only the last result of a parallel tool step", () => {
    const messages = setAnthropicCacheBreakpoints(
      [
        ...HISTORY,
        {
          role: "tool",
          content: ["a", "b", "c"].map((id) => toolResult(`call-${id}`)),
        },
      ],
      HISTORY_END_INDEX,
    );

    expect(countBreakpoints(messages)).toBe(3);
    const last = messages.at(-1)!;
    expect(last.role === "tool" && last.content.map(hasBreakpoint)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("keeps the newest breakpoint off a trailing assistant message", () => {
    const messages = setAnthropicCacheBreakpoints(
      [...HISTORY, ...toolStep("call-1"), { role: "assistant", content: "" }],
      HISTORY_END_INDEX,
    );

    expect(countBreakpoints(messages.slice(-2, -1))).toBe(1);
    expect(hasBreakpoint(messages.at(-1)!)).toBe(false);
  });

  it("keeps other provider options when moving a breakpoint", () => {
    const [system] = setAnthropicCacheBreakpoints(
      [
        {
          role: "system",
          content: "system prompt",
          providerOptions: { anthropic: { other: true }, openai: { x: 1 } },
        },
        { role: "user", content: "hi" },
      ],
      0,
    );

    expect(system.providerOptions).toEqual({
      anthropic: { other: true, cacheControl: { type: "ephemeral" } },
      openai: { x: 1 },
    });
  });

  it("sends a growing, unchanged prefix with a breakpoint on the newest message each step", async () => {
    const requests: OpenRouterRequest[] = [];
    const openrouter = createOpenRouter({
      apiKey: "test",
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        requests.push(body);
        return Response.json(fakeCompletion(requests.length));
      },
    });

    await generateText({
      model: openrouter.chat("anthropic/claude-sonnet-4.5"),
      allowSystemInMessages: true,
      messages: setAnthropicCacheBreakpoints(HISTORY, HISTORY_END_INDEX),
      tools: {
        searchInbox: tool({
          inputSchema: z.object({ page: z.number() }),
          execute: async ({ page }) => ({ page, threads: ["t1", "t2"] }),
        }),
      },
      stopWhen: isStepCount(4),
      prepareStep: ({ messages }) => ({
        messages: setAnthropicCacheBreakpoints(messages, HISTORY_END_INDEX),
      }),
    });

    expect(requests).toHaveLength(4);
    for (const [index, request] of requests.entries()) {
      const marked = request.messages.flatMap((message, messageIndex) =>
        JSON.stringify(message).includes('"cache_control"')
          ? [messageIndex]
          : [],
      );
      expect(marked).toEqual([
        0,
        HISTORY_BREAKPOINT_INDEX,
        request.messages.length - 1,
      ]);

      const previous = requests[index - 1];
      if (!previous) continue;
      expect(
        request.messages
          .slice(0, previous.messages.length)
          .map(withoutCacheControl),
      ).toEqual(previous.messages.map(withoutCacheControl));
    }
  });
});

type OpenRouterRequest = { messages: Record<string, unknown>[] };

function toolStep(toolCallId: string): ModelMessage[] {
  return [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId,
          toolName: "searchInbox",
          input: {},
        },
      ],
    },
    { role: "tool", content: [toolResult(toolCallId)] },
  ];
}

function toolResult(toolCallId: string) {
  return {
    type: "tool-result" as const,
    toolCallId,
    toolName: "searchInbox",
    output: { type: "json" as const, value: { threads: [] } },
  };
}

function hasBreakpoint(target: { providerOptions?: unknown }) {
  return JSON.stringify(target.providerOptions ?? {}).includes("cacheControl");
}

function countBreakpoints(messages: ModelMessage[]) {
  return messages.reduce((count, message) => {
    if (message.role === "tool") {
      return count + message.content.filter(hasBreakpoint).length;
    }
    return count + (hasBreakpoint(message) ? 1 : 0);
  }, 0);
}

// The provider sends a lone text part as a plain string once it has no
// breakpoint; Anthropic reads both forms as the same text block.
function withoutCacheControl(message: Record<string, unknown>) {
  const { content } = message;
  return JSON.parse(
    JSON.stringify(
      {
        ...message,
        content:
          typeof content === "string"
            ? [{ type: "text", text: content }]
            : content,
      },
      (key, value) => (key === "cache_control" ? undefined : value),
    ),
  );
}

function fakeCompletion(requestNumber: number) {
  const isLast = requestNumber >= 4;
  return {
    id: `gen-${requestNumber}`,
    object: "chat.completion",
    created: 0,
    model: "anthropic/claude-sonnet-4.5",
    choices: [
      {
        index: 0,
        finish_reason: isLast ? "stop" : "tool_calls",
        message: {
          role: "assistant",
          content: isLast ? "Done." : null,
          tool_calls: isLast
            ? undefined
            : [
                {
                  id: `call-${requestNumber}`,
                  type: "function",
                  function: {
                    name: "searchInbox",
                    arguments: JSON.stringify({ page: requestNumber }),
                  },
                },
              ],
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}
