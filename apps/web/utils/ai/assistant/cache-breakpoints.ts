import type { JSONValue, ModelMessage, ToolContent } from "ai";

type ProviderOptions = Record<string, Record<string, JSONValue>>;

// Anthropic reads a cached prefix only up to a breakpoint, so a tool loop needs
// one on the newest message: each step then reads everything earlier steps
// sent. The system prompt and the end of earlier history keep their own so a
// new turn can reuse them. Three stays under Anthropic's limit of four.
// prepareStep messages carry over to the next step, so this also clears the
// previous step's breakpoint instead of letting them pile up.
export function setAnthropicCacheBreakpoints(
  messages: ModelMessage[],
  stablePrefixEndIndex: number,
): ModelMessage[] {
  const lastIndex = messages.length - 1;
  const breakpointIndexes = new Set([
    0,
    getHistoryBreakpointIndex(
      messages,
      Math.max(0, Math.min(stablePrefixEndIndex, lastIndex)),
    ),
    lastIndex,
  ]);

  return messages.map((message, index) => {
    const enabled = breakpointIndexes.has(index);
    if (message.role !== "tool") return withCacheControl(message, enabled);

    // OpenRouter copies a tool message's cache control onto every result in
    // it, which would go over the limit after parallel tool calls.
    const lastPartIndex = message.content.length - 1;
    return {
      ...withCacheControl(message, false),
      content: message.content.map((part, partIndex) =>
        withCacheControl(part, enabled && partIndex === lastPartIndex),
      ) as ToolContent,
    };
  });
}

function withCacheControl<T extends { providerOptions?: unknown }>(
  target: T,
  enabled: boolean,
): T {
  const providerOptions = target.providerOptions as ProviderOptions | undefined;
  if (enabled === !!providerOptions?.anthropic?.cacheControl) return target;

  const { cacheControl: _previous, ...anthropic } =
    providerOptions?.anthropic ?? {};

  return {
    ...target,
    providerOptions: {
      ...providerOptions,
      anthropic: enabled
        ? { ...anthropic, cacheControl: { type: "ephemeral" } }
        : anthropic,
    },
  };
}

// OpenRouter ignores cache control on assistant messages, and history usually
// ends with the assistant's reply, so mark the closest earlier message instead.
function getHistoryBreakpointIndex(messages: ModelMessage[], endIndex: number) {
  for (let index = endIndex; index > 0; index--) {
    if (messages[index].role !== "assistant") return index;
  }
  return 0;
}
