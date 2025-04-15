import useSWR from "swr";
import type {
  MessagesBatchQuery,
  MessagesBatchResponse,
} from "@/app/api/google/messages/batch/route";

export function useMessagesBatch({ ids }: Partial<MessagesBatchQuery>) {
  const searchParams = new URLSearchParams({});
  if (ids) searchParams.set("ids", ids.join(","));

  const url = `/api/google/messages/batch?${searchParams.toString()}`;
  const { data, isLoading, error, mutate } = useSWR<MessagesBatchResponse>(
    ids?.length ? url : null,
  );

  return { data, isLoading, error, mutate };
}
