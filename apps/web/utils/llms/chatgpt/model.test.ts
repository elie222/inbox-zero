import { generateObject, generateText, jsonSchema, streamText, tool } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CHATGPT_PROVIDER_OPTIONS,
  createChatGptLanguageModel,
  rewriteResponsesBody,
} from "./model";

vi.mock("@/utils/llms/chatgpt/connection", () => ({
  getChatGptAccessToken: vi.fn().mockResolvedValue("oauth-access-token"),
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatGPT plan language model", () => {
  it("generates text through a streamed request with the OAuth token", async () => {
    fetchMock.mockResolvedValue(sseResponse(textEvents('{"ok":true}')));

    const result = await generateText({
      model: createChatGptLanguageModel("gpt-6.1-sol"),
      system: "You are helpful.",
      prompt: "Hi",
      temperature: 0.2,
      maxOutputTokens: 100,
      providerOptions: CHATGPT_PROVIDER_OPTIONS,
    });

    expect(result.text).toBe('{"ok":true}');
    expect(result.usage.inputTokens).toBe(5);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer oauth-access-token",
    );
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ store: false, stream: true });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("max_output_tokens");
    expect(body.input[0]).toMatchObject({ role: "developer" });
  });

  it("returns structured output from generateObject", async () => {
    fetchMock.mockResolvedValue(sseResponse(textEvents('{"label":"news"}')));

    const result = await generateObject({
      model: createChatGptLanguageModel("gpt-6.1-sol"),
      schema: z.object({ label: z.string() }),
      prompt: "Classify",
      providerOptions: CHATGPT_PROVIDER_OPTIONS,
    });

    expect(result.object).toEqual({ label: "news" });
  });

  it("namespaces function tools and surfaces tool calls by their plain name", async () => {
    fetchMock.mockResolvedValue(
      sseResponse(functionCallEvents("lookup", '{"query":"invoice"}')),
    );

    const result = await generateText({
      model: createChatGptLanguageModel("gpt-6.1-sol"),
      prompt: "Find the invoice",
      tools: {
        lookup: tool({
          description: "Look up an email",
          inputSchema: jsonSchema<{ query: string }>({
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
            additionalProperties: false,
          }),
        }),
      },
      providerOptions: CHATGPT_PROVIDER_OPTIONS,
    });

    expect(result.toolCalls).toEqual([
      expect.objectContaining({
        toolName: "lookup",
        input: { query: "invoice" },
      }),
    ]);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.tools).toEqual([
      expect.objectContaining({
        type: "namespace",
        tools: [expect.objectContaining({ type: "function", name: "lookup" })],
      }),
    ]);
  });

  it("streams text", async () => {
    fetchMock.mockResolvedValue(sseResponse(textEvents("Hello there")));

    const result = streamText({
      model: createChatGptLanguageModel("gpt-6.1-sol"),
      prompt: "Hi",
      providerOptions: CHATGPT_PROVIDER_OPTIONS,
    });

    expect(await result.text).toBe("Hello there");
  });

  it("surfaces a plan usage limit as an error", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "ChatGPT plan usage limit reached",
            type: "rate_limit_error",
            code: "subscription_sharing_usage_limit_exceeded",
            param: null,
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      generateText({
        model: createChatGptLanguageModel("gpt-6.1-sol"),
        prompt: "Hi",
        maxRetries: 0,
        providerOptions: CHATGPT_PROVIDER_OPTIONS,
      }),
    ).rejects.toThrow("ChatGPT plan usage limit reached");
  });
});

describe("rewriteResponsesBody", () => {
  it("tags replayed function calls with the tool namespace", () => {
    const body = rewriteResponsesBody({
      input: [
        {
          type: "function_call",
          call_id: "call_1",
          name: "lookup",
          arguments: "{}",
        },
        { type: "function_call_output", call_id: "call_1", output: "done" },
      ],
    });

    expect(body.input).toEqual([
      expect.objectContaining({
        type: "function_call",
        namespace: "inboxzero",
      }),
      { type: "function_call_output", call_id: "call_1", output: "done" },
    ]);
  });
});

const RESPONSE = {
  id: "resp_1",
  object: "response",
  created_at: 1_790_000_000,
  model: "gpt-6.1-sol",
  service_tier: "default",
};

const USAGE = {
  input_tokens: 5,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 3,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 8,
};

function textEvents(text: string) {
  const message = { type: "message", id: "msg_1", role: "assistant" };
  return [
    {
      type: "response.created",
      response: { ...RESPONSE, status: "in_progress" },
    },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { ...message, status: "in_progress", content: [] },
    },
    {
      type: "response.output_text.delta",
      item_id: "msg_1",
      output_index: 0,
      content_index: 0,
      delta: text,
      logprobs: [],
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: {
        ...message,
        status: "completed",
        content: [{ type: "output_text", text, annotations: [], logprobs: [] }],
      },
    },
    completedEvent(),
  ];
}

function functionCallEvents(name: string, args: string) {
  const call = {
    type: "function_call",
    id: "fc_1",
    call_id: "call_1",
    name,
    namespace: "inboxzero",
  };
  return [
    {
      type: "response.created",
      response: { ...RESPONSE, status: "in_progress" },
    },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { ...call, arguments: "", status: "in_progress" },
    },
    {
      type: "response.function_call_arguments.delta",
      item_id: "fc_1",
      output_index: 0,
      delta: args,
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: { ...call, arguments: args, status: "completed" },
    },
    completedEvent(),
  ];
}

function completedEvent() {
  return {
    type: "response.completed",
    response: {
      ...RESPONSE,
      status: "completed",
      incomplete_details: null,
      usage: USAGE,
    },
  };
}

function sseResponse(events: Record<string, unknown>[]) {
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}
