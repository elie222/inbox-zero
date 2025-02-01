import useSWR from "swr";
import type { ThreadsBatchResponse } from "@/app/api/google/threads/batch/route";

export function useThreadsByIds({ threadIds }: { threadIds: string[] }) {
  const searchParams = new URLSearchParams();
  searchParams.set("threadIds", threadIds.join(","));
  const url = `/api/google/threads/batch?${searchParams.toString()}`;
  const { data, isLoading, error, mutate } = useSWR<ThreadsBatchResponse>(url);

  return { data, isLoading, error, mutate };
}
