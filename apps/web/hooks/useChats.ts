import useSWR from "swr";
import type { GetChatsResponse } from "@/app/api/chats/route";

export function useChats(shouldFetch = true) {
  return useSWR<GetChatsResponse>(shouldFetch ? "/api/chats" : null);
}
