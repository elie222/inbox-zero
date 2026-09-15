import useSWR, { useSWRConfig } from "swr";
import type { UserResponse } from "@/app/api/user/me/route";
import { processSWRResponse } from "@/utils/swr";

export function useUser(enabled = true) {
  const { fetcher } = useSWRConfig();
  const swrResult = useSWR<UserResponse | { error: string }>(
    enabled ? "/api/user/me" : null,
    fetcher ?? fetchUser,
  );
  const processed = processSWRResponse<UserResponse>(swrResult);

  // Treat 401 as "not authenticated" — return null data without error
  // so components render the logged-out state instead of error UI
  const rawError = swrResult.error as (Error & { status?: number }) | undefined;
  if (rawError?.status === 401) {
    return { ...processed, data: null, error: undefined, isLoading: false };
  }

  return processed;
}

// Public pricing routes also need the session, without loading mailbox providers.
async function fetchUser(
  url: string,
): Promise<UserResponse | { error: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw Object.assign(new Error("Failed to load user"), {
      status: response.status,
    });
  }
  return response.json();
}
