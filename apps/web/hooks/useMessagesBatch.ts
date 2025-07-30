import useSWR from "swr";
import type { MessagesBatchQuery } from "@/app/api/messages/validation";
import type { MessagesBatchResponse } from "@/app/api/messages/batch/route";

export function useMessagesBatch({
  ids,
  parseReplies,
}: Partial<MessagesBatchQuery>) {
  const searchParams = new URLSearchParams({});
  if (ids) searchParams.set("ids", ids.join(","));
  if (parseReplies) searchParams.set("parseReplies", parseReplies.toString());

  const url = `/api/messages/batch?${searchParams.toString()}`;
  const { data, isLoading, error, mutate } = useSWR<MessagesBatchResponse>(
    ids?.length ? url : null,
  );

  return { data, isLoading, error, mutate };
}
