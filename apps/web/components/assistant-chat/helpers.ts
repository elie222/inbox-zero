import type { UIMessage } from "@ai-sdk/ui-utils";
import type { GetChatResponse } from "@/app/api/chats/[chatId]/route";
import type {
  ChatMessage,
  ChatTools,
  CustomUIDataTypes,
} from "@/components/assistant-chat/types";

export function convertToUIMessages(chat: GetChatResponse): ChatMessage[] {
  return (
    chat?.messages.map((message) => ({
      id: message.id,
      role: message.role as UIMessage["role"],
      parts: message.parts,
      // metadata: {
      //   createdAt: formatISO(message.createdAt),
      // },
    })) || []
  );
}
