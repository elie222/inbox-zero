import type {
  LanguageModelV4Message,
  LanguageModelV4Middleware,
  LanguageModelV4Prompt,
} from "@ai-sdk/provider";

// Chat templates of many local models (LM Studio, vLLM, llama.cpp) reject
// consecutive messages with the same role, while callers add context as
// separate user messages. Hosted providers accept that, so this only wraps
// OpenAI-compatible models.
export const coalesceConsecutiveMessagesMiddleware: LanguageModelV4Middleware =
  {
    specificationVersion: "v4",
    transformParams: async ({ params }) => ({
      ...params,
      prompt: coalesceConsecutiveMessages(params.prompt),
    }),
  };

export function coalesceConsecutiveMessages(
  prompt: LanguageModelV4Prompt,
): LanguageModelV4Prompt {
  const result: LanguageModelV4Prompt = [];

  for (const message of prompt) {
    const previous = result.at(-1);
    if (previous?.role === message.role) {
      result[result.length - 1] = mergeMessages(previous, message);
    } else {
      result.push(message);
    }
  }

  return result;
}

function mergeMessages(
  first: LanguageModelV4Message,
  second: LanguageModelV4Message,
): LanguageModelV4Message {
  const providerOptions =
    first.providerOptions || second.providerOptions
      ? { ...first.providerOptions, ...second.providerOptions }
      : undefined;

  if (first.role === "system" || second.role === "system") {
    return {
      role: "system",
      content: joinText([first.content, second.content] as string[]),
      providerOptions,
    };
  }

  const content = [...first.content, ...second.content];
  const texts = content.flatMap((part) =>
    part.type === "text" ? [part.text] : [],
  );

  return {
    ...first,
    // Plain text stays a single string in the request, which every chat
    // template handles.
    content:
      texts.length === content.length
        ? [{ type: "text", text: joinText(texts) }]
        : content,
    providerOptions,
  } as LanguageModelV4Message;
}

function joinText(parts: string[]) {
  return parts.filter(Boolean).join("\n\n");
}
