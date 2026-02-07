import useSWR from "swr";
import type { GetChatResponse } from "@/app/api/chats/[chatId]/route";
import type { ChatType } from "@/generated/prisma/client";

export function useChatMessages(chatId: string | null, type?: ChatType) {
  const params = type ? `?type=${type}` : "";
  return useSWR<GetChatResponse>(
    chatId ? `/api/chats/${chatId}${params}` : null,
  );
}
