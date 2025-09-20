import useSWR from "swr";
import type { ThreadsResponse } from "@/app/api/threads/route";
import type { Thread as EmailThread } from "@/components/email-list/types";
import type { ThreadsQuery } from "@/app/api/threads/validation";

export type Thread = EmailThread;

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
  const query: ThreadsQuery = {
    fromEmail,
    limit,
    type,
  };

  // biome-ignore lint/suspicious/noExplicitAny: params
  const url = `/api/threads?${new URLSearchParams(query as any).toString()}`;
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(url, {
    refreshInterval,
  });

  return { data, isLoading, error, mutate };
}
