"use client";

import useSWR from "swr";
import { ClientOnly } from "@/components/ClientOnly";
import { SendersTable } from "@/components/GroupedTable";
import { LoadingContent } from "@/components/LoadingContent";
import { UncategorizedSendersResponse } from "@/app/api/user/categorize/senders/uncategorized/route";
import { Category } from "@prisma/client";

function useSenders() {
  return useSWR<UncategorizedSendersResponse>(
    "/api/user/categorize/senders/uncategorized",
  );
}

export function Uncategorized({ categories }: { categories: Category[] }) {
  const { data, isLoading, error } = useSenders();

  return (
    <LoadingContent loading={isLoading} error={error}>
      <ClientOnly>
        <SendersTable
          senders={
            data?.uncategorizedSenders.map((sender) => ({
              address: sender,
              category: null,
            })) || []
          }
          categories={categories}
        />
      </ClientOnly>
    </LoadingContent>
  );
}
