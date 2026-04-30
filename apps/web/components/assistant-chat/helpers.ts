import type { UIMessage, UIMessagePart } from "ai";
import type { GetChatResponse } from "@/app/api/chats/[chatId]/route";
import type {
  ChatMessage,
  ChatTools,
  CustomUIDataTypes,
} from "@/components/assistant-chat/types";

type PendingEmailActionType = "send_email" | "reply_email" | "forward_email";

export function convertToUIMessages(chat: GetChatResponse): ChatMessage[] {
  return (
    chat?.messages.map((message) => ({
      id: message.id,
      role: message.role as UIMessage<ChatMessage>["role"],
      parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
      // metadata: {
      //   createdAt: formatISO(message.createdAt),
      // },
    })) || []
  );
}

export function getPendingEmailSubjectPrefix(
  actionType: PendingEmailActionType,
) {
  if (actionType === "reply_email") return "Re: ";
  if (actionType === "forward_email") return "Fwd: ";
  return "";
}
