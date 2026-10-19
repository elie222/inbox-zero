import type { UIMessage, UIMessagePart } from "ai";
import type { GetChatResponse } from "@/app/api/chats/[chatId]/route";
import type {
  ChatMessage,
  ChatTools,
  CustomUIDataTypes,
  MessageMetadata,
} from "@/components/assistant-chat/types";

type PendingEmailActionType = "send_email" | "reply_email" | "forward_email";

export function convertToUIMessages(chat: GetChatResponse): ChatMessage[] {
  return (
    chat?.messages.map((message) => ({
      id: message.id,
      role: message.role as UIMessage<ChatMessage>["role"],
      parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
      metadata: getStoredRunMetadata(message.metadata),
    })) || []
  );
}

function getStoredRunMetadata(stored: unknown): MessageMetadata | undefined {
  if (typeof stored !== "object" || stored === null) return;
  const run = (stored as { assistantRun?: Record<string, unknown> })
    .assistantRun;
  if (!run) return;

  return {
    model: typeof run.modelName === "string" ? run.modelName : undefined,
    thinking:
      run.thinking === "on" || run.thinking === "off"
        ? run.thinking
        : undefined,
    durationMs: typeof run.durationMs === "number" ? run.durationMs : undefined,
  };
}

export function getPendingEmailSubjectPrefix(
  actionType: PendingEmailActionType,
) {
  if (actionType === "reply_email") return "Re: ";
  if (actionType === "forward_email") return "Fwd: ";
  return "";
}
