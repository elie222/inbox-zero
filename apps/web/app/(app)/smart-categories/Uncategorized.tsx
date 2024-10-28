"use client";

import useSWR from "swr";
import { ClientOnly } from "@/components/ClientOnly";
import { GroupedTable } from "@/components/GroupedTable";
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
        <GroupedTable
          emailGroups={
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
