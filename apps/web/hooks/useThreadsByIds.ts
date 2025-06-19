import useSWR from "swr";
import type { ThreadsBatchResponse } from "@/app/api/google/threads/batch/route";

export function useThreadsByIds(
  { threadIds }: { threadIds: string[] },
  options?: { keepPreviousData?: boolean },
) {
  const searchParams = new URLSearchParams({ threadIds: threadIds.join(",") });
  console.log("TEST LOG 23");
  const url = `/api/google/threads/batch?${searchParams.toString()}`;
  const { data, isLoading, error, mutate } = useSWR<ThreadsBatchResponse>(
    threadIds.length ? url : null,
    options,
  );

  // Return null data when there are no threadIds
  // Prevents an issue with keepPreviousData showing data when there isn't any
  if (!threadIds.length)
    return { data: null, isLoading: false, error: null, mutate };

  return { data, isLoading, error, mutate };
}
