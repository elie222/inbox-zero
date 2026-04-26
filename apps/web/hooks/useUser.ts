import useSWR from "swr";
import type { UserResponse } from "@/app/api/user/me/route";
import { processSWRResponse } from "@/utils/swr";

export function useUser() {
  const swrResult = useSWR<UserResponse | { error: string }>("/api/user/me");
  const processed = processSWRResponse<UserResponse>(swrResult);

  // Treat 401 as "not authenticated" — return null data without error
  // so components render the logged-out state instead of error UI
  const rawError = swrResult.error as (Error & { status?: number }) | undefined;
  if (rawError?.status === 401) {
    return { ...processed, data: null, error: undefined, isLoading: false };
  }

  return processed;
}
