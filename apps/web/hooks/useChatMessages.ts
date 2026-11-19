import useSWR from "swr";
import type { GetChatResponse } from "@/app/api/chats/[chatId]/route";

export function useChatMessages(chatId: string | null) {
  return useSWR<GetChatResponse, Error & { info?: Record<string, unknown> }>(
    chatId ? `/api/chats/${chatId}` : null,
  );
}
