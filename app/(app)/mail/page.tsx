"use client";

import useSWR from "swr";
import { List } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import { ThreadsResponse } from "@/app/api/google/threads/route";
// import { Filters, getFilterFunction } from "@/utils/filters";
// import { usePromptContext } from "@/providers/PromptProvider";

export default function Home() {
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(
    "/api/google/threads",
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    }
  );

  // const { prompt, filterFunction } = usePromptContext();

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <List
          emails={data?.threads || []}
          // prompt={prompt}
          // filter={
          //   filterFunction
          //     ? getFilterFunction(filterFunction.name as Filters)
          //     : undefined
          // }
          // filterArgs={
          //   filterFunction ? { label: filterFunction.args.label } : undefined
          // }
          refetch={mutate}
        />
      )}
    </LoadingContent>
  );
}
