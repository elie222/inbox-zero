import type { JSONValue, ModelMessage, ToolContent } from "ai";

type ProviderOptions = Record<string, Record<string, JSONValue>>;

function mergeContent(
  contentA: ModelMessage["content"],
  contentB: ModelMessage["content"],
): ModelMessage["content"] {
  if (contentA === "") return contentB;
  if (contentB === "") return contentA;

  if (typeof contentA === "string" && typeof contentB === "string") {
    return `${contentA}\n\n${contentB}`;
  }

  if (Array.isArray(contentA) && Array.isArray(contentB)) {
    return [...contentA, ...contentB] as ToolContent;
  }

  if (typeof contentA === "string" && Array.isArray(contentB)) {
    return [{ type: "text", text: contentA }, ...contentB] as ToolContent;
  }

  if (Array.isArray(contentA) && typeof contentB === "string") {
    return [...contentA, { type: "text", text: contentB }] as ToolContent;
  }

  return contentB;
}

function mergeProviderOptions(
  optionsA?: ProviderOptions,
  optionsB?: ProviderOptions,
): ProviderOptions | undefined {
  if (!optionsA && !optionsB) return;
  if (!optionsA) return optionsB;
  if (!optionsB) return optionsA;

  const merged: ProviderOptions = { ...optionsA };
  for (const [provider, settings] of Object.entries(optionsB)) {
    if (
      merged[provider] &&
      typeof merged[provider] === "object" &&
      !Array.isArray(merged[provider]) &&
      settings &&
      typeof settings === "object" &&
      !Array.isArray(settings)
    ) {
      merged[provider] = {
        ...merged[provider],
        ...settings,
      };
    } else {
      merged[provider] = settings;
    }
  }
  return merged;
}

/**
 * Coalesces consecutive messages of the same role (e.g., user -> user -> user)
 * into a single message with concatenated content and merged provider options.
 *
 * This prevents Jinja exceptions when sending consecutive user messages to
 * OpenAI-compatible backends (such as LM Studio, vLLM, Ollama, HuggingFace TGI,
 * Mistral) whose chat templates enforce strict role alternation, while also
 * respecting API constraints on Anthropic and Bedrock.
 */
export function coalesceConsecutiveMessages(
  messages: ModelMessage[],
): ModelMessage[] {
  if (!messages || messages.length <= 1) return messages;

  const result: ModelMessage[] = [];

  for (const message of messages) {
    const prev = result.at(-1);

    if (prev && prev.role === message.role) {
      const mergedContent = mergeContent(prev.content, message.content);
      const mergedProviderOptions = mergeProviderOptions(
        prev.providerOptions as ProviderOptions | undefined,
        message.providerOptions as ProviderOptions | undefined,
      );

      result[result.length - 1] = {
        ...prev,
        content: mergedContent,
        ...(mergedProviderOptions
          ? { providerOptions: mergedProviderOptions }
          : {}),
      } as ModelMessage;
    } else {
      result.push(message);
    }
  }

  return result;
}
