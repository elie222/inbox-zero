import { jsonSchema, streamText, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createFinalReplyStep } from "@/utils/ai/assistant/final-reply-step";

describe("createFinalReplyStep", () => {
  it("asks for a text-only reply when the run would end without one", async () => {
    const { model, calls } = createModel([
      toolCallStep("call-1"),
      reasoningOnlyStep(),
      textStep("Archived 40 newsletters."),
    ]);

    const text = await runChat(model);

    expect(text).toBe("Archived 40 newsletters.");
    expect(calls).toHaveLength(3);
    expect(calls[2]).toMatchObject({ toolChoice: { type: "none" }, tools: 0 });
    expect(calls[1]).toMatchObject({ toolChoice: { type: "auto" }, tools: 1 });
  });

  it("does not add a step when the run ends with a reply", async () => {
    const { model, calls } = createModel([
      toolCallStep("call-1"),
      textStep("Done."),
    ]);

    const text = await runChat(model);

    expect(text).toBe("Done.");
    expect(calls).toHaveLength(2);
  });

  it("asks only once", async () => {
    const { model, calls } = createModel([
      reasoningOnlyStep(),
      reasoningOnlyStep(),
      textStep("Unused"),
    ]);

    await runChat(model);

    expect(calls).toHaveLength(2);
  });
});

async function runChat(model: MockLanguageModelV4) {
  const finalReply = createFinalReplyStep();
  const result = streamText({
    model,
    messages: [{ role: "user", content: "Clean up my newsletters" }],
    tools: {
      manageInbox: tool({
        description: "Archive threads",
        inputSchema: jsonSchema({ type: "object", properties: {} }),
        execute: async () => ({ success: true }),
      }),
    },
    stopWhen: () => false,
    experimental_steering: finalReply.steering,
    onStepEnd: (step) => finalReply.onStepEnd(step),
    prepareStep: ({ experimental_steeringMessages }) =>
      finalReply.isFinalReplyStep(experimental_steeringMessages)
        ? { activeTools: [], toolChoice: "none" }
        : undefined,
  });

  return result.text;
}

type StreamPart = Record<string, unknown>;

function createModel(steps: StreamPart[][]) {
  const calls: Array<{ toolChoice: unknown; tools: number }> = [];
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      const step = steps[calls.length];
      calls.push({
        toolChoice: options.toolChoice,
        tools: options.tools?.length ?? 0,
      });
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of [
              { type: "stream-start", warnings: [] },
              ...step,
              finishPart(
                step.some((part) => part.type === "tool-call")
                  ? "tool-calls"
                  : "stop",
              ),
            ]) {
              controller.enqueue(part as never);
            }
            controller.close();
          },
        }),
      };
    },
  });

  return { model, calls };
}

function reasoningOnlyStep(): StreamPart[] {
  return [
    { type: "reasoning-start", id: "reasoning" },
    { type: "reasoning-delta", id: "reasoning", delta: "All done." },
    { type: "reasoning-end", id: "reasoning" },
  ];
}

function textStep(text: string): StreamPart[] {
  return [
    { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: text },
    { type: "text-end", id: "text" },
  ];
}

function toolCallStep(toolCallId: string): StreamPart[] {
  return [
    {
      type: "tool-call",
      toolCallId,
      toolName: "manageInbox",
      input: "{}",
    },
  ];
}

function finishPart(unified: "stop" | "tool-calls"): StreamPart {
  return {
    type: "finish",
    finishReason: { unified, raw: unified },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
  };
}
