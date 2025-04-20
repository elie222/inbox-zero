import useSWR from "swr";
import type { UserResponse } from "@/app/api/user/me/route";
import { processSWRResponse } from "@/utils/swr"; // Import the generic helper

export function useUser() {
  const swrResult = useSWR<UserResponse | { error: string }>("/api/user/me");
  return processSWRResponse<UserResponse>(swrResult);
}
