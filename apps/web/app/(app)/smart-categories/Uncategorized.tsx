"use client";

import useSWRInfinite from "swr/infinite";
import { useMemo, useCallback } from "react";
import { ChevronsDownIcon, SparklesIcon } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { SendersTable } from "@/components/GroupedTable";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import type { UncategorizedSendersResponse } from "@/app/api/user/categorize/senders/uncategorized/route";
import type { Category } from "@prisma/client";
import { TopBar } from "@/components/TopBar";
import { toastError } from "@/components/Toast";
import {
  useHasProcessingItems,
  pushToAiCategorizeSenderQueueAtom,
} from "@/store/ai-categorize-sender-queue";
import { SectionDescription } from "@/components/Typography";
import { ButtonLoader } from "@/components/Loading";

function useSenders() {
  const getKey = (
    pageIndex: number,
    previousPageData: UncategorizedSendersResponse | null,
  ) => {
    // Reached the end
    if (previousPageData && !previousPageData.nextOffset) return null;

    const baseUrl = "/api/user/categorize/senders/uncategorized";
    const offset = pageIndex === 0 ? 0 : previousPageData?.nextOffset;

    return `${baseUrl}?offset=${offset}`;
  };

  const { data, size, setSize, isLoading } =
    useSWRInfinite<UncategorizedSendersResponse>(getKey, {
      revalidateOnFocus: false,
      revalidateFirstPage: false,
      persistSize: true,
      revalidateOnMount: true,
    });

  const loadMore = useCallback(() => {
    setSize(size + 1);
  }, [setSize, size]);

  // Combine all senders from all pages
  const allSenders = useMemo(() => {
    if (!data) return [];
    return data.flatMap((page) => page.uncategorizedSenders);
  }, [data]);

  // Check if there's more data to load by looking at the last page
  const hasMore = !!data?.[data.length - 1]?.nextOffset;

  return {
    data: allSenders,
    loadMore,
    isLoading,
    hasMore,
  };
}

export function Uncategorized({ categories }: { categories: Category[] }) {
  const { data: senderAddresses, loadMore, isLoading, hasMore } = useSenders();
  const hasProcessingItems = useHasProcessingItems();

  const senders = useMemo(
    () =>
      senderAddresses.map((address) => ({
        address,
        category: null,
      })),
    [senderAddresses],
  );

  return (
    <LoadingContent loading={!senderAddresses && isLoading}>
      <TopBar>
        <Button
          loading={hasProcessingItems}
          onClick={async () => {
            if (!senderAddresses.length) {
              toastError({ description: "No senders to categorize" });
              return;
            }

            pushToAiCategorizeSenderQueueAtom(senderAddresses);
          }}
        >
          <SparklesIcon className="mr-2 size-4" />
          Categorize all with AI
        </Button>
      </TopBar>
      <ClientOnly>
        {senders.length ? (
          <>
            <SendersTable senders={senders} categories={categories} />
            {hasMore && (
              <Button
                variant="outline"
                className="mx-2 mb-4 mt-2 w-full"
                onClick={loadMore}
              >
                {isLoading ? (
                  <ButtonLoader />
                ) : (
                  <ChevronsDownIcon className="mr-2 size-4" />
                )}
                Load More
              </Button>
            )}
          </>
        ) : (
          !isLoading && (
            <SectionDescription className="p-4">
              No senders left to categorize!
            </SectionDescription>
          )
        )}
      </ClientOnly>
    </LoadingContent>
  );
}
