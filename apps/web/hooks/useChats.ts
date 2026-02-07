import useSWR from "swr";
import type { GetChatsResponse } from "@/app/api/chats/route";
import type { ChatType } from "@/generated/prisma/client";

export function useChats(shouldFetch: boolean, type?: ChatType) {
  const params = type ? `?type=${type}` : "";
  return useSWR<GetChatsResponse>(shouldFetch ? `/api/chats${params}` : null);
}
