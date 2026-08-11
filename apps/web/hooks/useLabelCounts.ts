import { useMemo } from "react";
import useSWR from "swr";
import type { LabelCountsResponse } from "@/app/api/labels/counts/route";

/**
 * Unread/total counts per label and Gmail category for the mail sidebar.
 * Deliberately not blocking: the sidebar renders without counts and fills in.
 */
export function useLabelCounts() {
  const { data, error, isLoading, mutate } = useSWR<LabelCountsResponse>(
    "/api/labels/counts",
    { shouldRetryOnError: false },
  );

  const countsById = useMemo(
    () => new Map((data?.counts ?? []).map((count) => [count.id, count])),
    [data?.counts],
  );

  return {
    countsById,
    isPartial: data?.partial ?? true,
    isLoading,
    error,
    mutate,
  };
}
