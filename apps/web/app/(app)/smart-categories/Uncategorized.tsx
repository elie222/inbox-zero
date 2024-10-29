"use client";

import useSWR from "swr";
import { useAtomValue } from "jotai";
import { SparklesIcon } from "lucide-react";
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
import { useMemo } from "react";

function useSenders() {
  return useSWR<UncategorizedSendersResponse>(
    "/api/user/categorize/senders/uncategorized",
    {
      revalidateOnFocus: false,
    },
  );
}

export function Uncategorized({ categories }: { categories: Category[] }) {
  const { data, isLoading, error } = useSenders();

  const hasProcessingItems = useHasProcessingItems();

  const senders = useMemo(
    () =>
      data?.uncategorizedSenders.map((sender) => ({
        address: sender,
        category: null,
      })) || [],
    [data?.uncategorizedSenders],
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      <TopBar>
        <Button
          loading={hasProcessingItems}
          onClick={async () => {
            if (!data?.uncategorizedSenders.length) {
              toastError({ description: "No senders to categorize" });
              return;
            }

            pushToAiCategorizeSenderQueueAtom(data.uncategorizedSenders);
          }}
        >
          <SparklesIcon className="mr-2 size-4" />
          Categorize all with AI
        </Button>
      </TopBar>
      <ClientOnly>
        {senders.length ? (
          <SendersTable senders={senders} categories={categories} />
        ) : (
          <SectionDescription className="p-4">
            No senders left to categorize!
          </SectionDescription>
        )}
      </ClientOnly>
    </LoadingContent>
  );
}
