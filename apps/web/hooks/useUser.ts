import useSWR from "swr";
import type { UserResponse } from "@/app/api/user/me/route";
import type { UserSecretsResponse } from "@/app/api/user/secrets/route";
import { processSWRResponse } from "@/utils/swr"; // Import the generic helper

export function useUser() {
  const swrResult = useSWR<UserResponse | { error: string }>("/api/user/me");
  return processSWRResponse<UserResponse>(swrResult);
}

// Fetch user secrets separately - only use on settings pages
export function useUserSecrets() {
  const swrResult = useSWR<UserSecretsResponse | { error: string }>(
    "/api/user/secrets",
  );
  return processSWRResponse<UserSecretsResponse>(swrResult);
}
