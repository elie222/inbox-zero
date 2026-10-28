import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A local stand-in for an OpenAI-compatible chat completions API, in the
 * spirit of the Stripe emulator next to it. The app talks to it through the
 * real AI SDK via the `openai-compatible` provider, so request shaping,
 * structured-output parsing, retries and fallbacks are all exercised.
 *
 * It is deliberately not a model: by default every request gets the smallest
 * answer that satisfies whatever the caller asked for. Structured requests get
 * an object that validates against the JSON schema they sent (nullable fields
 * are null, enums take their first value, arrays are empty), forced tool calls
 * get schema-valid arguments, and plain chat gets a short line of text. Tests
 * that need a specific answer register one with `reply()` or the
 * `/__emulator/replies` endpoint, matched by a substring of the prompt.
 */

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const DEFAULT_MODEL_NAME = "emulated";
const DEFAULT_TEXT = "Emulated response.";

type JsonSchema = Record<string, unknown>;

type ChatMessage = {
  role: string;
  content?: unknown;
};

type ChatCompletionRequest = {
  model?: string;
  messages?: ChatMessage[];
  stream?: boolean;
  response_format?: {
    type?: string;
    json_schema?: { schema?: JsonSchema; name?: string };
  };
  tools?: {
    type: string;
    function: { name: string; parameters?: JsonSchema };
  }[];
  tool_choice?: unknown;
};

export interface LlmEmulatorReply {
  /** Case-insensitive substring of the prompt text this reply applies to. Omit to match every request. */
  match?: string;
  object?: unknown;
  text?: string;
  toolCall?: { name: string; arguments: Record<string, unknown> };
}

export interface LlmEmulatorRequest {
  messages: { role: string; content: string }[];
  model: string;
  schemaName: string | null;
  stream: boolean;
  toolNames: string[];
}

export interface LlmEmulatorOptions {
  /** The model id the app must ask for. Defaults to `emulated`. */
  modelName?: string;
  port?: number;
}

export interface LlmEmulator {
  close(): Promise<void>;
  modelName: string;
  /** Registers a scripted reply. Later registrations win over earlier ones. */
  reply(reply: LlmEmulatorReply): void;
  /** Every chat completion request received since the last reset, oldest first. */
  requests: LlmEmulatorRequest[];
  /** Drops scripted replies and the request log. */
  reset(): void;
  url: string;
}

export async function createLlmEmulator(
  options: LlmEmulatorOptions = {},
): Promise<LlmEmulator> {
  const modelName = options.modelName ?? DEFAULT_MODEL_NAME;
  const replies: LlmEmulatorReply[] = [];
  const requests: LlmEmulatorRequest[] = [];

  const server = createServer((request, response) => {
    handle(request, response).catch((error) => {
      respondJson(response, 500, { error: { message: String(error) } });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://llm.emulator");
    const path = url.pathname.replace(/\/+$/, "");
    const body = await readBody(request);

    if (path === "/health") return respondJson(response, 200, { ok: true });

    if (path === "/__emulator/reset" && request.method === "POST") {
      reset();
      return respondJson(response, 200, { ok: true });
    }

    if (path === "/__emulator/replies" && request.method === "POST") {
      replies.push(JSON.parse(body) as LlmEmulatorReply);
      return respondJson(response, 200, { ok: true });
    }

    if (path === "/__emulator/requests" && request.method === "GET") {
      return respondJson(response, 200, requests);
    }

    if (path === "/v1/models" && request.method === "GET") {
      return respondJson(response, 200, {
        object: "list",
        data: [{ id: modelName, object: "model", owned_by: "emulator" }],
      });
    }

    if (path === "/v1/chat/completions" && request.method === "POST") {
      const completionRequest = JSON.parse(body) as ChatCompletionRequest;
      if (completionRequest.model !== modelName) {
        return respondJson(response, 404, {
          error: {
            message: `The LLM emulator only serves the model "${modelName}"`,
            type: "invalid_request_error",
          },
        });
      }

      const summary = summarizeRequest(completionRequest);
      requests.push(summary);
      const completion = resolveCompletion(completionRequest, summary, replies);

      if (completionRequest.stream) {
        return respondStream(response, modelName, completion);
      }
      return respondJson(response, 200, buildCompletion(modelName, completion));
    }

    respondJson(response, 404, {
      error: {
        message: `The LLM emulator does not implement ${request.method} ${path}`,
        type: "invalid_request_error",
      },
    });
  }

  function reset() {
    replies.length = 0;
    requests.length = 0;
  }

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    modelName,
    reply: (reply) => {
      replies.push(reply);
    },
    requests,
    reset,
    url: `http://127.0.0.1:${port}`,
  };
}

type Completion = {
  content: string | null;
  toolCall: { name: string; arguments: string } | null;
};

function resolveCompletion(
  request: ChatCompletionRequest,
  summary: LlmEmulatorRequest,
  replies: LlmEmulatorReply[],
): Completion {
  const promptText = summary.messages
    .map((message) => message.content)
    .join("\n")
    .toLowerCase();
  const scripted = [...replies]
    .reverse()
    .find(
      (reply) => !reply.match || promptText.includes(reply.match.toLowerCase()),
    );

  if (scripted?.toolCall) {
    return {
      content: null,
      toolCall: {
        name: scripted.toolCall.name,
        arguments: JSON.stringify(scripted.toolCall.arguments),
      },
    };
  }
  if (scripted?.object !== undefined) {
    return { content: JSON.stringify(scripted.object), toolCall: null };
  }
  if (scripted?.text !== undefined) {
    return { content: scripted.text, toolCall: null };
  }

  const schema = request.response_format?.json_schema?.schema;
  if (schema) {
    return { content: JSON.stringify(fillJsonSchema(schema)), toolCall: null };
  }
  if (request.response_format?.type === "json_object") {
    return { content: "{}", toolCall: null };
  }

  const forcedTool = getForcedTool(request);
  if (forcedTool) {
    return {
      content: null,
      toolCall: {
        name: forcedTool.function.name,
        arguments: JSON.stringify(
          fillJsonSchema(forcedTool.function.parameters ?? { type: "object" }),
        ),
      },
    };
  }

  return { content: DEFAULT_TEXT, toolCall: null };
}

function getForcedTool(request: ChatCompletionRequest) {
  const tools = request.tools ?? [];
  if (!tools.length) return null;

  const choice = request.tool_choice;
  if (choice === "required") return tools[0];
  if (
    typeof choice === "object" &&
    choice !== null &&
    "function" in choice &&
    typeof (choice as { function?: { name?: string } }).function?.name ===
      "string"
  ) {
    const name = (choice as { function: { name: string } }).function.name;
    return tools.find((tool) => tool.function.name === name) ?? null;
  }
  return null;
}

/**
 * Builds the smallest value that satisfies a JSON schema as emitted by the AI
 * SDK for Zod schemas. Prefers null when it is allowed and otherwise the first
 * option, so the default answer reads as "nothing found" rather than as an
 * invented fact.
 */
export function fillJsonSchema(schema: JsonSchema, root: JsonSchema = schema) {
  return fill(schema, root, 0);
}

function fill(schema: JsonSchema, root: JsonSchema, depth: number): unknown {
  if (depth > 32) return null;

  if (typeof schema.$ref === "string") {
    return fill(resolveRef(schema.$ref, root), root, depth + 1);
  }
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  const alternatives = (schema.anyOf ?? schema.oneOf) as
    | JsonSchema[]
    | undefined;
  if (Array.isArray(alternatives) && alternatives.length) {
    const nullable = alternatives.find((option) => option.type === "null");
    if (nullable) return null;
    return fill(alternatives[0], root, depth + 1);
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    return Object.assign(
      {},
      ...(schema.allOf as JsonSchema[]).map((part) =>
        fill(part, root, depth + 1),
      ),
    );
  }

  const type = Array.isArray(schema.type)
    ? (schema.type as string[]).includes("null")
      ? "null"
      : (schema.type as string[])[0]
    : schema.type;

  switch (type) {
    case "null":
      return null;
    case "boolean":
      return false;
    case "integer":
    case "number":
      return fillNumber(schema);
    case "string":
      return fillString(schema);
    case "array": {
      const minItems =
        typeof schema.minItems === "number" ? schema.minItems : 0;
      const items = (schema.items ?? {}) as JsonSchema;
      return Array.from({ length: minItems }, () =>
        fill(items, root, depth + 1),
      );
    }
    case "object":
    case undefined: {
      const properties = (schema.properties ?? {}) as Record<
        string,
        JsonSchema
      >;
      const required = Array.isArray(schema.required)
        ? (schema.required as string[])
        : [];
      const result: Record<string, unknown> = {};
      for (const key of required) {
        const property = properties[key];
        if (property) result[key] = fill(property, root, depth + 1);
      }
      return result;
    }
    default:
      return null;
  }
}

function fillNumber(schema: JsonSchema) {
  if (typeof schema.exclusiveMinimum === "number") {
    return schema.exclusiveMinimum + 1;
  }
  if (typeof schema.minimum === "number") return schema.minimum;
  if (typeof schema.exclusiveMaximum === "number") {
    return Math.min(0, schema.exclusiveMaximum - 1);
  }
  if (typeof schema.maximum === "number") return Math.min(0, schema.maximum);
  return 0;
}

function fillString(schema: JsonSchema) {
  switch (schema.format) {
    case "date-time":
      return new Date(0).toISOString();
    case "date":
      return "1970-01-01";
    case "email":
      return "emulated@example.com";
    case "uri":
    case "url":
      return "https://example.com/emulated";
    default: {
      const minLength =
        typeof schema.minLength === "number" ? schema.minLength : 0;
      const text = DEFAULT_TEXT.slice(0, -1).padEnd(minLength, ".");
      return typeof schema.maxLength === "number"
        ? text.slice(0, schema.maxLength)
        : text;
    }
  }
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema {
  const segments = ref.replace(/^#\/?/, "").split("/").filter(Boolean);
  let current: unknown = root;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return {};
    current = (current as Record<string, unknown>)[segment];
  }
  return (current as JsonSchema | undefined) ?? {};
}

function summarizeRequest(request: ChatCompletionRequest): LlmEmulatorRequest {
  return {
    model: request.model ?? "",
    messages: (request.messages ?? []).map((message) => ({
      role: message.role,
      content: flattenContent(message.content),
    })),
    stream: Boolean(request.stream),
    schemaName: request.response_format?.json_schema?.name ?? null,
    toolNames: (request.tools ?? []).map((tool) => tool.function.name),
  };
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .join("\n");
  }
  return "";
}

function buildCompletion(modelName: string, completion: Completion) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: completion.content,
          ...(completion.toolCall
            ? {
                tool_calls: [
                  {
                    id: "call_emulated",
                    type: "function",
                    function: completion.toolCall,
                  },
                ],
              }
            : {}),
        },
        finish_reason: completion.toolCall ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

function respondStream(
  response: ServerResponse,
  modelName: string,
  completion: Completion,
) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const base = {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: modelName,
  };
  const send = (
    delta: Record<string, unknown>,
    finishReason: string | null,
  ) => {
    response.write(
      `data: ${JSON.stringify({
        ...base,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      })}\n\n`,
    );
  };

  send({ role: "assistant" }, null);
  if (completion.toolCall) {
    send(
      {
        tool_calls: [
          {
            index: 0,
            id: "call_emulated",
            type: "function",
            function: { name: completion.toolCall.name, arguments: "" },
          },
        ],
      },
      null,
    );
    send(
      {
        tool_calls: [
          { index: 0, function: { arguments: completion.toolCall.arguments } },
        ],
      },
      null,
    );
  } else if (completion.content) {
    send({ content: completion.content }, null);
  }
  response.write(
    `data: ${JSON.stringify({
      ...base,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: completion.toolCall ? "tool_calls" : "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })}\n\n`,
  );
  response.end("data: [DONE]\n\n");
}

function respondJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
