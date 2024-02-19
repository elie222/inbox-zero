"use client";

import { useCallback, useEffect } from "react";
import useSWR from "swr";
import { useLocalStorage } from "usehooks-ts";
import { useSetAtom } from "jotai";
import { List } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import { Banner } from "@/components/Banner";
import {
  type ThreadsQuery,
  type ThreadsResponse,
} from "@/app/api/google/threads/route";
import { refetchEmailListAtom } from "@/store/email";

export default function Mail({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const query: ThreadsQuery = searchParams.type
    ? { type: searchParams.type }
    : {};

  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(
    `/api/google/threads?${new URLSearchParams(query as any).toString()}`,
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
          if (!removedThreadIds) return { threads: currentData?.threads || [] };
          const threads =
            currentData?.threads.filter(
              (t) => !removedThreadIds.includes(t.id),
            ) || [];
          return { threads };
        },
        populateCache: (_, currentData) => {
          if (!removedThreadIds) return { threads: currentData?.threads || [] };
          const threads =
            currentData?.threads.filter(
              (t) => !removedThreadIds.includes(t.id),
            ) || [];
          return { threads };
        },
      });
    },
    [mutate],
  );

  // store `refetch` in the atom so we can refresh the list upon archive via command k
  // TODO is this the best way to do this?
  const setRefetchEmailList = useSetAtom(refetchEmailListAtom);
  useEffect(() => {
    setRefetchEmailList({ refetch });
  }, [refetch, setRefetchEmailList]);

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
        {data && (
          <List
            emails={data.threads}
            refetch={refetch}
            type={searchParams.type}
          />
        )}
      </LoadingContent>
    </>
  );
}
