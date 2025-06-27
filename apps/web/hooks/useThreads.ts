import useSWR from "swr";
import type { ThreadsResponse as GmailThreadsResponse } from "@/app/api/google/threads/controller";
import type { ThreadsResponse as MicrosoftThreadsResponse } from "@/app/api/microsoft/threads/controller";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { Thread as EmailThread } from "@/components/email-list/types";

export type ThreadsResponse = GmailThreadsResponse | MicrosoftThreadsResponse;
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
  const { provider } = useAccount();
  const searchParams = new URLSearchParams();
  if (fromEmail) searchParams.set("fromEmail", fromEmail);
  if (limit) searchParams.set("limit", limit.toString());
  if (type) searchParams.set("type", type);
  const url = `/api/${provider === "google" ? "google" : "microsoft"}/threads?${searchParams.toString()}`;
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(url, {
    refreshInterval,
  });

  return { data, isLoading, error, mutate };
}
