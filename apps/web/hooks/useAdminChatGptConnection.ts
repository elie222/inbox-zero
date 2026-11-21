import useSWR from "swr";
import type { GetChatGptConnectionResponse } from "@/app/api/admin/chatgpt/route";

export function useAdminChatGptConnection() {
  return useSWR<GetChatGptConnectionResponse>("/api/admin/chatgpt");
}
