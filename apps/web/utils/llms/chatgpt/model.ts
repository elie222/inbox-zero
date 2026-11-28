import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4Warning,
} from "@ai-sdk/provider";
import { createOpenAI } from "@ai-sdk/openai";
import { Provider } from "@/utils/llms/config";
import { getChatGptAccessToken } from "@/utils/llms/chatgpt/connection";
import { CHATGPT_API_RESOURCE } from "@/utils/llms/chatgpt/oauth";

// ChatGPT plan usage rejects these Responses fields:
// https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
const UNSUPPORTED_REQUEST_FIELDS = [
  "background",
  "conversation",
  "max_output_tokens",
  "max_tool_calls",
  "metadata",
  "moderation",
  "multi_agent",
  "prompt",
  "prompt_cache_retention",
  "previous_response_id",
  "safety_identifier",
  "temperature",
  "top_logprobs",
  "top_p",
  "truncation",
  "user",
];

const TOOL_NAMESPACE = "inboxzero";

export const CHATGPT_PROVIDER_OPTIONS = {
  openai: { store: false, systemMessageMode: "developer" },
};

export function createChatGptLanguageModel(modelName: string): LanguageModelV4 {
  const inner = createOpenAI({
    // Replaced per request with the OAuth access token.
    apiKey: "chatgpt-oauth",
    baseURL: CHATGPT_API_RESOURCE,
    fetch: chatGptFetch,
  }).responses(modelName);

  return {
    specificationVersion: "v4",
    provider: Provider.CHATGPT,
    modelId: modelName,
    supportedUrls: inner.supportedUrls,
    doStream: (options: LanguageModelV4CallOptions) => inner.doStream(options),
    // Plan usage only accepts streamed requests.
    doGenerate: async (options: LanguageModelV4CallOptions) =>
      collectStream(await inner.doStream(options)),
  } as LanguageModelV4;
}

async function chatGptFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const accessToken = await getChatGptAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  let body = init?.body;
  if (
    typeof body === "string" &&
    headers.get("content-type")?.includes("json")
  ) {
    body = JSON.stringify(rewriteResponsesBody(JSON.parse(body)));
  }

  return fetch(input, { ...init, headers, body });
}

export function rewriteResponsesBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const rewritten: Record<string, unknown> = {
    ...body,
    store: false,
    stream: true,
  };
  for (const field of UNSUPPORTED_REQUEST_FIELDS) delete rewritten[field];

  if (Array.isArray(rewritten.input)) {
    rewritten.input = rewritten.input.map(rewriteInputItem);
  }

  if (Array.isArray(rewritten.tools)) {
    const functionTools = rewritten.tools.filter(isFunctionTool);
    const otherTools = rewritten.tools.filter((tool) => !isFunctionTool(tool));
    rewritten.tools = functionTools.length
      ? [
          {
            type: "namespace",
            name: TOOL_NAMESPACE,
            description: "Inbox Zero tools.",
            tools: functionTools,
          },
          ...otherTools,
        ]
      : otherTools;
  }

  return rewritten;
}

async function collectStream(
  result: LanguageModelV4StreamResult,
): Promise<LanguageModelV4GenerateResult> {
  const content: LanguageModelV4Content[] = [];
  // Text and reasoning arrive as start/delta/end parts keyed by id.
  const openParts = new Map<string, number>();
  let warnings: SharedV4Warning[] = [];
  let finish:
    | Extract<LanguageModelV4StreamPart, { type: "finish" }>
    | undefined;
  let responseMetadata: Record<string, unknown> = {};

  const reader = result.stream.getReader();
  while (true) {
    const { done, value: part } = await reader.read();
    if (done) break;

    switch (part.type) {
      case "stream-start":
        warnings = part.warnings;
        break;
      case "response-metadata": {
        const { type: _type, ...metadata } = part;
        responseMetadata = metadata;
        break;
      }
      case "text-start":
      case "reasoning-start":
        openParts.set(part.id, content.length);
        content.push({
          type: part.type === "text-start" ? "text" : "reasoning",
          text: "",
          providerMetadata: part.providerMetadata,
        });
        break;
      case "text-delta":
      case "reasoning-delta": {
        const item = content[openParts.get(part.id) ?? -1];
        if (item?.type === "text" || item?.type === "reasoning") {
          item.text += part.delta;
        }
        break;
      }
      case "text-end":
      case "reasoning-end": {
        const item = content[openParts.get(part.id) ?? -1];
        if (part.providerMetadata && item && "providerMetadata" in item) {
          item.providerMetadata = part.providerMetadata;
        }
        openParts.delete(part.id);
        break;
      }
      case "tool-call":
      case "tool-result":
      case "tool-approval-request":
      case "source":
      case "file":
      case "reasoning-file":
      case "custom":
        content.push(part);
        break;
      case "finish":
        finish = part;
        break;
      case "error":
        throw part.error;
    }
  }

  if (!finish) {
    throw new Error("ChatGPT response stream ended before completion");
  }

  return {
    content,
    finishReason: finish.finishReason,
    usage: finish.usage,
    providerMetadata: finish.providerMetadata,
    warnings,
    request: result.request,
    response: { ...responseMetadata, headers: result.response?.headers },
  };
}

function rewriteInputItem(item: unknown) {
  if (!item || typeof item !== "object") return item;
  const record = item as Record<string, unknown>;
  if (record.role === "system") return { ...record, role: "developer" };
  if (record.type === "function_call" && !record.namespace) {
    return { ...record, namespace: TOOL_NAMESPACE };
  }
  return item;
}

function isFunctionTool(tool: unknown) {
  return (
    !!tool &&
    typeof tool === "object" &&
    (tool as { type?: unknown }).type === "function"
  );
}
