import { generateObject, generateText, streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createLlmEmulator, fillJsonSchema, type LlmEmulator } from "./llm";

let emulator: LlmEmulator;

beforeAll(async () => {
  emulator = await createLlmEmulator();
});

afterAll(async () => {
  await emulator.close();
});

beforeEach(() => {
  emulator.reset();
});

function model() {
  return createOpenAICompatible({
    name: "openai-compatible",
    baseURL: `${emulator.url}/v1`,
    supportsStructuredOutputs: true,
  })(emulator.modelName);
}

describe("LLM emulator through the AI SDK", () => {
  it("answers structured requests with a schema-valid object", async () => {
    const schema = z.object({
      reasoning: z.string(),
      ruleName: z.string().nullable(),
      matchedRules: z.array(z.object({ name: z.string() })),
      confidence: z.enum(["low", "high"]),
      noMatchFound: z.boolean(),
    });

    const result = await generateObject({
      model: model(),
      schema,
      prompt: "Pick a rule. Respond in JSON.",
    });

    expect(schema.safeParse(result.object).success).toBe(true);
    expect(result.object).toMatchObject({
      ruleName: null,
      matchedRules: [],
      confidence: "low",
      noMatchFound: false,
    });
    expect(emulator.requests).toHaveLength(1);
    expect(emulator.requests[0]?.messages.at(-1)?.content).toContain(
      "Pick a rule",
    );
  });

  it("uses a scripted reply when the prompt matches", async () => {
    emulator.reply({
      match: "newsletter",
      object: { ruleName: "Newsletter", noMatchFound: false },
    });
    const schema = z.object({
      ruleName: z.string().nullable(),
      noMatchFound: z.boolean(),
    });

    const scripted = await generateObject({
      model: model(),
      schema,
      prompt: "Classify this newsletter. Respond in JSON.",
    });
    const unscripted = await generateObject({
      model: model(),
      schema,
      prompt: "Classify this invoice. Respond in JSON.",
    });

    expect(scripted.object.ruleName).toBe("Newsletter");
    expect(unscripted.object.ruleName).toBeNull();
  });

  it("answers plain and streamed chat with text", async () => {
    const plain = await generateText({ model: model(), prompt: "Hello" });
    expect(plain.text).toBe("Emulated response.");

    const streamed = streamText({ model: model(), prompt: "Hello again" });
    let text = "";
    for await (const chunk of streamed.textStream) text += chunk;
    expect(text).toBe("Emulated response.");
    expect(await streamed.finishReason).toBe("stop");
  });

  it("calls a required tool with schema-valid arguments", async () => {
    const result = await generateText({
      model: model(),
      prompt: "Archive it",
      tools: {
        archive: {
          description: "Archive an email",
          inputSchema: z.object({
            threadId: z.string(),
            reason: z.string().nullable(),
          }),
        },
      },
      toolChoice: "required",
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      toolName: "archive",
      input: { threadId: "Emulated response", reason: null },
    });
  });

  it("rejects unknown models so misconfiguration is visible", async () => {
    const wrongModel = createOpenAICompatible({
      name: "openai-compatible",
      baseURL: `${emulator.url}/v1`,
    })("gpt-real");

    await expect(
      generateText({ model: wrongModel, prompt: "Hello" }),
    ).rejects.toThrow(/only serves the model/);
  });
});

describe("fillJsonSchema", () => {
  it("follows refs, honors minimums, and prefers null when allowed", () => {
    expect(
      fillJsonSchema({
        type: "object",
        required: ["count", "items", "child", "maybe", "when"],
        properties: {
          count: { type: "integer", exclusiveMinimum: 2 },
          items: { type: "array", minItems: 2, items: { type: "string" } },
          child: { $ref: "#/definitions/child" },
          maybe: { anyOf: [{ type: "string" }, { type: "null" }] },
          when: { type: "string", format: "date-time" },
        },
        definitions: {
          child: {
            type: "object",
            required: ["ok"],
            properties: { ok: { type: "boolean" } },
          },
        },
      }),
    ).toEqual({
      count: 3,
      items: ["Emulated response", "Emulated response"],
      child: { ok: false },
      maybe: null,
      when: "1970-01-01T00:00:00.000Z",
    });
  });
});
