import useSWR from "swr";
import type { ThreadsResponse } from "@/app/api/threads/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { Thread as EmailThread } from "@/components/email-list/types";

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
  const searchParams = new URLSearchParams();
  if (fromEmail) searchParams.set("fromEmail", fromEmail);
  if (limit) searchParams.set("limit", limit.toString());
  if (type) searchParams.set("type", type);
  const url = `/api/threads?${searchParams.toString()}`;
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(url, {
    refreshInterval,
  });

  return { data, isLoading, error, mutate };
}
