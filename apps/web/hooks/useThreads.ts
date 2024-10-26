import useSWR from "swr";
import type { ThreadsResponse } from "@/app/api/google/threads/controller";
import type { ThreadsQuery } from "@/app/api/google/threads/validation";

export function useThreads({
  fromEmail,
  limit,
  type,
  refreshInterval,
}: {
  fromEmail?: string;
  type?: string;
  limit?: number;
  refreshInterval?: number;
}) {
  const params: ThreadsQuery = {
    fromEmail,
    limit,
    type,
  };
  const url = `/api/google/threads?${new URLSearchParams(params as any).toString()}`;
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(url, {
    refreshInterval,
  });

  return { data, isLoading, error, mutate };
}
