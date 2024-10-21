import useSWR from "swr";
import type { UserResponse } from "@/app/api/user/me/route";

export function useUser() {
  return useSWR<UserResponse>("/api/user/me");
}
