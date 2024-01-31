"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useLocalStorage } from "usehooks-ts";
import { List } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import { ThreadsResponse } from "@/app/api/google/threads/route";
import { Banner } from "@/components/Banner";

export default function Mail() {
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(
    "/api/google/threads",
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    },
  );

  const refetch = useCallback(
    (removedThreadIds?: string[]) => {
      mutate(undefined, {
        rollbackOnError: true,
        optimisticData: (currentData) => {
          const threads =
            currentData?.threads.filter(
              (t) => !removedThreadIds?.includes(t.id),
            ) || [];
          return { threads };
        },
        populateCache: (_, currentData) => {
          const threads =
            currentData?.threads.filter(
              (t) => !removedThreadIds?.includes(t.id),
            ) || [];
          return { threads };
        },
      });
    },
    [mutate],
  );

  const [bannerVisible, setBannerVisible] = useLocalStorage<
    boolean | undefined
  >("mailBetaBannerVisibile", true);

  return (
    <>
      {bannerVisible && typeof window !== "undefined" && (
        <Banner
          title="Beta"
          description="Mail is currently in beta. It is not intended to be a full replacement for your email client yet."
          onClose={() => setBannerVisible(false)}
        />
      )}
      <LoadingContent loading={isLoading} error={error}>
        {data && <List emails={data?.threads || []} refetch={refetch} />}
      </LoadingContent>
    </>
  );
}
