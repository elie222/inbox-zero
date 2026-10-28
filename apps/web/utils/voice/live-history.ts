import type { LiveHistoryMessage } from "@/utils/voice/types";

const DEFAULT_MAX_MESSAGES = 8;
const DEFAULT_MAX_CHARS = 4000;

export function liveHistoryFromUiMessages(
  messages: Array<{
    role?: string;
    parts?: Array<{ type?: string; text?: string }>;
  }>,
  { maxMessages = DEFAULT_MAX_MESSAGES, maxChars = DEFAULT_MAX_CHARS } = {},
): LiveHistoryMessage[] {
  const history: LiveHistoryMessage[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = textFromParts(message.parts).trim();
    if (!text) continue;
    history.push({ role: message.role, text });
  }

  const recent = history.slice(-maxMessages);
  let total = recent.reduce((sum, message) => sum + message.text.length, 0);
  while (recent.length > 1 && total > maxChars) {
    const removed = recent.shift();
    total -= removed?.text.length ?? 0;
  }
  if (recent[0] && recent[0].text.length > maxChars) {
    recent[0] = {
      ...recent[0],
      text: recent[0].text.slice(recent[0].text.length - maxChars),
    };
  }
  return recent;
}

function textFromParts(
  parts: Array<{ type?: string; text?: string }> | undefined,
): string {
  if (!parts?.length) return "";
  return parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n")
    .trim();
}
